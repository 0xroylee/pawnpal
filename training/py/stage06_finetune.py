#!/usr/bin/env python3
"""Prepare isolated Qwen chat data and run MLX-LM LoRA."""
import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path

COMPACT_REVISION = "21457c6f51ed54a7c16e988c0844db973815c137"
REVISION = "70d244cc86ccca08cf5af4e1e306ecf908b1ad5e"


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    for flag in ("data", "base", "out"):
        p.add_argument("--" + flag, required=True)
    p.add_argument("--tokenizer-from")
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--epochs", type=float, default=3)
    p.add_argument("--iters", type=int, help="Override epoch-derived iterations, e.g. 1 for smoke")
    p.add_argument("--rank", type=int, default=16)
    p.add_argument("--scale", type=float, default=2.0)
    p.add_argument("--learning-rate", type=float, default=1e-4)
    p.add_argument("--max-seq-length", type=int, default=2048)
    p.add_argument("--dry-run", action="store_true")
    return p


def plan(a):
    if (a.batch_size < 1 or a.rank < 1 or a.max_seq_length < 2 or
        a.iters is not None and a.iters < 1 or
        any(not math.isfinite(x) or x <= 0 for x in (a.epochs, a.scale, a.learning_rate))):
        raise ValueError("batch size, epochs, iters, rank, scale, learning rate and sequence length must be positive")
    data, base, out = (Path(x).expanduser().resolve() for x in (a.data, a.base, a.out))
    if out.exists():
        raise ValueError("output already exists; choose a fresh output directory")
    if not base.is_dir() or not data.is_dir():
        raise ValueError("base and data must be local directories")
    if out == base or out == data or base in out.parents or data in out.parents or out in base.parents or out in data.parents:
        raise ValueError("output must be separate from base and data")
    model_config = json.loads((base / "config.json").read_text()) if (base / "config.json").exists() else {}
    quantization = model_config.get("quantization")
    kind = "compact-4bit" if quantization else "original"
    tokenizer_from = Path(a.tokenizer_from).expanduser().resolve() if a.tokenizer_from else None
    if tokenizer_from and (out == tokenizer_from or out in tokenizer_from.parents or tokenizer_from in out.parents):
        raise ValueError("output must be separate from tokenizer source")
    if quantization:
        if quantization != {"group_size": 128, "bits": 4} or tokenizer_from is None:
            raise ValueError("compact 4-bit base requires --tokenizer-from and expected quantization")
        for name in ("tokenizer.json", "vocab.json", "merges.txt"):
            if hashlib.sha256((base / name).read_bytes()).digest() != hashlib.sha256((tokenizer_from / name).read_bytes()).digest():
                raise ValueError(f"tokenizer mismatch: {name}")
        if (base / "model.safetensors").stat().st_size != 914316100 or json.loads((base / "model.safetensors.index.json").read_text())["metadata"]["total_size"] != 914237440:
            raise ValueError("unexpected compact weights size")
    elif tokenizer_from:
        raise ValueError("--tokenizer-from is only supported for compact bases")
    config = (tokenizer_from or base) / "tokenizer_config.json"
    tokenizer = json.loads(config.read_text(encoding="utf-8"))
    if not isinstance(tokenizer.get("chat_template"), str) or not tokenizer["chat_template"]:
        raise ValueError("base tokenizer must have a chat_template")
    counts, hashes = {}, {}
    for split in ("train", "valid"):
        path = data / (split + ".jsonl")
        raw = path.read_bytes()
        hashes[split] = hashlib.sha256(raw).hexdigest()
        rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
        if not rows:
            raise ValueError(f"{split} split is empty")
        for row in rows:
            messages = row.get("messages") if isinstance(row, dict) else None
            if not isinstance(messages, list) or len(messages) < 2 or not isinstance(messages[-1], dict) or messages[-1].get("role") != "assistant" or not isinstance(messages[-1].get("content"), str):
                raise ValueError(f"invalid {split} chat row")
            if not any(isinstance(m, dict) and m.get("role") == "user" and isinstance(m.get("content"), str) for m in messages[:-1]):
                raise ValueError(f"{split} row requires a user message")
            if any(not isinstance(m, dict) or m.get("role") not in ("system", "user", "assistant") or not isinstance(m.get("content"), str) for m in messages):
                raise ValueError(f"invalid {split} message")
        counts[split] = len(rows)
    if any(a.batch_size > count for count in counts.values()):
        raise ValueError("batch size must not exceed either split count")
    iterations = a.iters if a.iters is not None else math.ceil(
        a.epochs * (counts["train"] // a.batch_size)
    )
    model, prepared, adapter = out / "model", out / "data", out / "adapter"
    yaml = (f"lora_parameters:\n  rank: {a.rank}\n  scale: {a.scale}\n  dropout: 0.0\n")
    command = [sys.executable, "-m", "mlx_lm.lora", "--model", str(model), "--train", "--data", str(prepared), "--adapter-path", str(adapter), "--config", str(out / "lora_config.yaml"), "--batch-size", str(a.batch_size), "--iters", str(iterations), "--learning-rate", str(a.learning_rate), "--max-seq-length", str(a.max_seq_length), "--mask-prompt"]
    return {"stage": "06-finetune", "base": str(base), "base_revision": COMPACT_REVISION if quantization else REVISION, "base_kind": kind, "quantization": quantization, "tokenizer_from": str(tokenizer_from) if tokenizer_from else None, "tokenizer_revision": REVISION, "template_sha256": hashlib.sha256(tokenizer["chat_template"].encode()).hexdigest(), "weights_bytes": (base / "model.safetensors").stat().st_size if (base / "model.safetensors").exists() else None, "data": str(data), "out": str(out), "counts": counts, "input_sha256": hashes, "epochs_requested": a.epochs, "iterations": iterations, "max_seq_length": a.max_seq_length, "representation": "messages; prefix first system content with newline; append /no_think once to last user; tokenizer template forces enable_thinking=false", "yaml": yaml, "command": command}


def execute(p):
    out, base, data = (Path(p[k]) for k in ("out", "base", "data"))
    out.mkdir(parents=True, exist_ok=False)
    # Copy the small configuration files and link immutable weights; never modify the base.
    def link_or_copy(src, dst):
        if Path(src).suffix == ".safetensors":
            Path(dst).symlink_to(Path(src).resolve())
        else:
            shutil.copy2(src, dst)
    shutil.copytree(base, out / "model", copy_function=link_or_copy, symlinks=False)
    config = out / "model" / "tokenizer_config.json"
    source_config = Path(p["tokenizer_from"]) / "tokenizer_config.json" if p["tokenizer_from"] else config
    tok = json.loads(source_config.read_text(encoding="utf-8"))
    tok["chat_template"] = "{% set enable_thinking = false %}" + tok["chat_template"]
    config.write_text(json.dumps(tok, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out / "data").mkdir()
    for split in ("train", "valid"):
        with (data / (split + ".jsonl")).open(encoding="utf-8") as source, (out / "data" / (split + ".jsonl")).open("x", encoding="utf-8") as target:
            for line in source:
                if not line.strip():
                    continue
                row = json.loads(line)
                system = next((m for m in row["messages"] if m["role"] == "system"), None)
                if system is not None:
                    system["content"] = "\n" + system["content"]
                user = next(m for m in reversed(row["messages"][:-1]) if m["role"] == "user")
                if not user["content"].endswith(" /no_think"):
                    user["content"] += " /no_think"
                target.write(json.dumps(row, ensure_ascii=False) + "\n")
    (out / "lora_config.yaml").write_text(p["yaml"], encoding="utf-8")
    (out / "metadata.json").write_text(json.dumps(p, indent=2) + "\n", encoding="utf-8")
    validate_targets(out, p["max_seq_length"])
    subprocess.run(p["command"], check=True)


def validate_targets(out, max_seq_length):
    from transformers import AutoTokenizer
    from mlx_lm.tuner.datasets import ChatDataset

    tokenizer = AutoTokenizer.from_pretrained(str(out / "model"), local_files_only=True)
    for split in ("train", "valid"):
        rows = [json.loads(line) for line in (out / "data" / (split + ".jsonl")).read_text(encoding="utf-8").splitlines() if line.strip()]
        dataset = ChatDataset(rows, tokenizer, mask_prompt=True)
        for index, row in enumerate(rows):
            tokens, offset = dataset.process(row)
            if max(offset, 1) >= min(len(tokens), max_seq_length):
                raise ValueError(f"{split} row {index + 1} has no supervised tokens")


def main():
    ap = parser()
    a = ap.parse_args()
    try:
        p = plan(a)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        ap.error(str(exc))
    if a.dry_run:
        print(json.dumps(p, indent=2))
    else:
        execute(p)

if __name__ == "__main__":
    main()
