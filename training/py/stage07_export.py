#!/usr/bin/env python3
"""Fuse an MLX adapter and create local Ollama models."""
import argparse
import hashlib
import fcntl
import pwd
import json
import os
import http.client
import re
import subprocess
import sys
from pathlib import Path


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ("base", "adapter", "out", "template", "q4-tag", "full-tag"):
        p.add_argument("--" + name, required=True)
    p.add_argument("--toolchain")
    p.add_argument("--dry-run", action="store_true")
    return p


def load_toolchain(path):
    manifest = Path(path).expanduser().resolve()
    manifest_bytes = manifest.read_bytes()
    data = json.loads(manifest_bytes.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("toolchain must be a JSON object")
    result = {}
    for key in ("python", "converter", "quantize"):
        value = data.get(key)
        if not isinstance(value, str) or not value:
            raise ValueError(f"toolchain {key} must be a path")
        target = Path(os.path.abspath(Path(value).expanduser())) if key == "python" else Path(value).expanduser().resolve()
        if not target.is_file() or (key != "converter" and not os.access(target, os.X_OK)):
            raise ValueError(f"invalid toolchain {key}: {target}")
        result[key] = str(target)
    result["manifest"] = str(manifest)
    result["manifest_sha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    return result


def lock_path():
    return Path(pwd.getpwuid(os.getuid()).pw_dir) / ".cache/pawnpal/stage07-export.lock"


def modelfile(from_path, content):
    return f'FROM {from_path}\nTEMPLATE """{content}"""\nPARAMETER temperature 0.6\nPARAMETER top_k 20\nPARAMETER top_p 0.95\nPARAMETER repeat_penalty 1\nPARAMETER stop "<|im_start|>"\nPARAMETER stop "<|im_end|>"\n'


def plan(a):
    base, adapter, out, template = (Path(x).expanduser().resolve() for x in (a.base, a.adapter, a.out, a.template))
    if out.exists():
        raise ValueError("output already exists; choose a fresh output directory")
    if not base.is_dir() or not adapter.is_dir() or not template.is_file():
        raise ValueError("base and adapter must be directories and template must be a file")
    if any(out == p or out in p.parents or p in out.parents for p in (base, adapter, template)):
        raise ValueError("output must be separate from inputs")
    tags = (a.q4_tag, a.full_tag)
    if any(not re.fullmatch(r"qwen3:pilot-[a-z0-9][a-z0-9_.-]*", tag) for tag in tags) or tags[0] == tags[1]:
        raise ValueError("provide distinct lowercase qwen3:pilot-* tags")
    content = template.read_text(encoding="utf-8")
    if not content.strip() or '"""' in content:
        raise ValueError("template must be nonempty and cannot contain triple quotes")
    model = modelfile("./fused", content)
    fuse = [sys.executable, "-m", "mlx_lm.fuse", "--model", str(base), "--adapter-path", str(adapter), "--save-path", str(out / "fused")]
    config = json.loads((base / "config.json").read_text()) if (base / "config.json").exists() else {}
    compact = bool(config.get("quantization"))
    if compact:
        fuse.append("--dequantize")
    toolchain = load_toolchain(a.toolchain) if a.toolchain else None
    if toolchain:
        f16 = out / "gguf/pip-f16.gguf"
        q4 = out / "gguf/pip-q4_k_m.gguf"
        models = {"Modelfile.q4": modelfile("./gguf/pip-q4_k_m.gguf", content), "Modelfile.full": modelfile("./gguf/pip-f16.gguf", content)}
        commands = [fuse, [toolchain["python"], toolchain["converter"], str(out / "fused"), "--outtype", "f16", "--outfile", str(f16)], [toolchain["quantize"], str(f16), str(q4), "Q4_K_M"], ["ollama", "create", a.q4_tag, "-f", str(out / "Modelfile.q4")], ["ollama", "create", a.full_tag, "-f", str(out / "Modelfile.full")]]
    else:
        models = {"Modelfile": model}
        commands = [fuse, ["ollama", "create", a.q4_tag, "-f", str(out / "Modelfile"), "--quantize", "q4_K_M"], ["ollama", "create", a.full_tag, "-f", str(out / "Modelfile")]]
    return {"fused_precision": "dequantized-4bit" if compact else "bf16-original", "stage": "07-export", "out": str(out), "template": str(template), "template_sha256": hashlib.sha256(template.read_bytes()).hexdigest(), "modelfile": model, "modelfiles": models, "toolchain": toolchain, "commands": commands}



def check_tags(tags):
    connection = http.client.HTTPConnection("127.0.0.1", 11434, timeout=5)
    try:
        connection.request("GET", "/api/tags")
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError(f"local Ollama readiness check failed: {response.status}")
        existing = {item["name"].lower() for item in json.load(response)["models"]}
    finally:
        connection.close()
    collisions = existing.intersection(tags)
    if collisions:
        raise ValueError("Ollama tags already exist: " + ", ".join(sorted(collisions)))


def main():
    ap = parser()
    a = ap.parse_args()
    try:
        p = plan(a)
    except (ValueError, OSError) as exc:
        ap.error(str(exc))
    if a.dry_run:
        print(json.dumps(p, indent=2))
        return
    try:
        check_tags([a.q4_tag, a.full_tag])
    except (ValueError, OSError) as exc:
        ap.error(str(exc))
    out = Path(p["out"])
    out.mkdir(parents=True, exist_ok=False)
    for name, content in p["modelfiles"].items():
        (out / name).write_text(content, encoding="utf-8")
    if p["toolchain"]:
        (out / "gguf").mkdir()
    (out / "metadata.json").write_text(json.dumps(p, indent=2) + "\n", encoding="utf-8")
    env = os.environ.copy()
    env["OLLAMA_HOST"] = "127.0.0.1:11434"
    for command in p["commands"][:-2]:
        subprocess.run(command, check=True, env=env)
    lock_file = lock_path()
    lock_file.parent.mkdir(parents=True, exist_ok=True)
    with lock_file.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            check_tags([a.q4_tag, a.full_tag])
            for command in p["commands"][-2:]:
                subprocess.run(command, check=True, env=env)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)

if __name__ == "__main__":
    main()
