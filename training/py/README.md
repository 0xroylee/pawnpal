# Local MLX pilot

Use Python 3.12 and MLX-LM on an Apple Silicon Mac. From the repository root, create and activate a dedicated environment.

```sh
python3.12 -m venv training/py/.venv
source training/py/.venv/bin/activate
python -m pip install 'mlx-lm==0.32.2'
```

Provide a local Qwen3 checkpoint. The full-weight path expects `Qwen/Qwen3-1.7B` at revision `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`. The pilot used the compact 4-bit option described below. Verify the revision and file hashes when you download the snapshot. Use a fresh output directory for each attempt so you can inspect earlier runs.

Stage 05's `train.jsonl` and `valid.jsonl` must be nonempty chat rows with a `messages` array ending in an assistant response. Stage 06 never reads the test split. It makes disposable copies of train and validation and prefixes the first system message content with one newline to match the Ollama template, and appends ` /no_think` to the last user message if absent. It copies tokenizer configuration and symlinks base safetensors into its own model directory; it prepends `enable_thinking = false` to the copied chat template. Original data and base remain untouched. The metadata records input hashes, counts, configuration and command. Do not remove or mutate the base while the run is in progress. Iterations default to `ceil(epochs * floor(train rows / batch size))`; `--iters` overrides this for smoke tests.

Before a real run, verify the pinned installed toolchain and the _full token sequence_, including the assistant prefix and completion, for a representative prepared row. Compare the installed MLX chat dataset loader's token IDs and prompt masking boundary with the IDs from the copied tokenizer's `apply_chat_template`, and compare its generation prefix to the original Ollama template rendering, including ` /no_think` and the empty thinking block. Stop on any mismatch. Inspect both loader and template rather than assuming that a text-rendered completion is equivalent:

```sh
python -m mlx_lm.lora --help
python -m mlx_lm.fuse --help
python -c 'import inspect, mlx_lm.tuner.datasets as d; print(inspect.getsource(d))'
```

Coordinator example, substituting local paths and the provisioned Python interpreter. Dry runs read input files but create no outputs. The first real invocation is a one-step smoke, and the second is a separate three-epoch pilot:

```sh
python training/py/stage06_finetune.py --data training/runs/RUN/05-split --base /path/to/pinned-base --out training/runs/smoke06 --iters 1 --batch-size 1 --dry-run
python training/py/stage06_finetune.py --data training/runs/RUN/05-split --base /path/to/pinned-base --out training/runs/smoke06 --iters 1 --batch-size 1
python training/py/stage06_finetune.py --data training/runs/RUN/05-split --base /path/to/pinned-base --out training/runs/pilot06 --epochs 3 --batch-size 1
```

Before launch, the installed MLX ChatDataset checks every prepared row for supervised tokens after truncation. Batch size cannot exceed either split count, and sequence length must be at least two.

Training invokes `mlx_lm.lora` with `--config`, `--model`, `--train`, `--data`, `--adapter-path`, `--batch-size`, `--iters`, `--learning-rate`, `--max-seq-length` and `--mask-prompt`. YAML sets LoRA rank, scale and dropout. Confirm these options against the installed CLI before execution. An explicit `--iters` can be used for other validated batch and iteration counts.

Export requires a local file containing the original model's Go template, obtained and verified by the coordinator from the stock model. It fuses the adapter and imports Q4_K_M and unquantized variants locally, using Modelfiles with stock temperature, top-k, top-p, repeat penalty and stop parameters. The unquantized import retains the precision determined by the fused weights and Ollama conversion; inspect the imported model to verify it. The runner checks both tags against the local Ollama server before creating either. Use unique lowercase `qwen3:pilot-*` tags. No push is performed.

```sh
ollama show qwen3:1.7b-q4_K_M --template > /path/to/stock-qwen3.template
python training/py/stage07_export.py --base training/runs/pilot06/model --adapter training/runs/pilot06/adapter --out training/runs/pilot07 --template /path/to/stock-qwen3.template --toolchain /path/to/manifest.json --q4-tag qwen3:pilot-q4 --full-tag qwen3:pilot-full --dry-run
python training/py/stage07_export.py --base training/runs/pilot06/model --adapter training/runs/pilot06/adapter --out training/runs/pilot07 --template /path/to/stock-qwen3.template --toolchain /path/to/manifest.json --q4-tag qwen3:pilot-q4 --full-tag qwen3:pilot-full
ollama show qwen3:pilot-q4 --template
ollama show qwen3:pilot-full --template
ollama show qwen3:pilot-q4 --parameters
ollama show qwen3:pilot-full --parameters
ollama run qwen3:pilot-q4 'Say hello in one sentence.'
ollama run qwen3:pilot-full 'Say hello in one sentence.'
```

Compare both templates and parameters with the stock model, verify import precision, and capture an Ollama rendered prompt for the token/prefix alignment check before evaluating. Local offline tests: `python3 -I training/py/tests/test_dry_run.py`.

Compact 4-bit fallback: pass `--base training/runs/toolchain-001/Qwen3-1.7B-MLX-4bit` and `--tokenizer-from training/runs/toolchain-001/Qwen3-1.7B` to stage 06. Matching tokenizer files are required; the original template is copied into the disposable model. Stage 07 dequantizes compact fusion. Metadata records the checkpoint and template fingerprint. Compare against a matched dequantized compact control.

Stage 07 serializes its final tag check and both imports with a per-user filesystem lock shared by local exporter invocations, including different output directories. This does not coordinate other tools, users, or remote exporters.

The export examples above target Ollama 0.34, which cannot import Qwen3 safetensors directly. Supply `--toolchain /path/to/manifest.json` with locally provisioned tools:

```json
{
  "python": "/absolute/path/to/python",
  "converter": "/absolute/path/to/convert_hf_to_gguf.py",
  "quantize": "/absolute/path/to/llama-quantize"
}
```

The tested bridge environment used llama.cpp b12756, Python 3.12, torch 2.15.0, numpy 2.5.5, and transformers 5.24.1 to read the MLX-generated tokenizer configuration. Python and quantize must be executable files; converter must be a file. The manifest checksum and resolved paths are recorded in metadata. The bridge converts fused weights to `gguf/pip-f16.gguf`, quantizes to `gguf/pip-q4_k_m.gguf`, and imports each using its own Modelfile without Ollama quantization. Omit `--toolchain` for the native import path only when Ollama supports direct Qwen3 safetensors import; that path is not the 0.34 pilot. The shared lock is `~/.cache/pawnpal/stage07-export.lock`, resolved from the operating system account home rather than environment variables.
