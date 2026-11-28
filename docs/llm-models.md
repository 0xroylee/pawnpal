# Pip model baseline

Run `baseline-2026-11-25T06-48-16-896Z` used Ollama 0.34.0 on Apple M4 Pro with 48 GiB of memory.
Each row used the same 100 distinct facts replayed from recorded Stockfish fixtures. The benchmark warmed each model and used a three-second request timeout. Latency includes fallbacks.

| Ollama model | Prompt | Accepted | Pass rate | Median | p95 | Fallbacks |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `qwen3:1.7b-q4_K_M` | Unchanged | 0/100 | 0.0% | 900 ms | 940 ms | `empty` × 100 |
| `qwen3:1.7b-q4_K_M` | `/no_think` | 1/100 | 1.0% | 911 ms | 946 ms | `empty` × 99 |
| `qwen3:4b-q4_K_M` | Unchanged | 0/100 | 0.0% | 1843 ms | 1919 ms | `empty` × 100 |
| `qwen3:4b-q4_K_M` | `/no_think` | 0/100 | 0.0% | 1861 ms | 1952 ms | `empty` × 100 |

## Training decision

The best 1.7B result used the `/no_think` prompt and passed 1.0%. It fell below the [spec 08](specs/08-llm-rephrasing.md) target of 80% and fell below the [spec 13](specs/13-train-coach-model.md) threshold of 90%.
Fine-tuning remains eligible under spec 13.

## Reproduce the run

Start Ollama on loopback, pull both exact tags above, install the locked dependencies with `bun install --frozen-lockfile`, and run `node training/run-baseline.mjs` from the repository root.
The local output in `training/runs/baseline-2026-11-25T06-48-16-896Z` contains the case list, per-case outcomes, fixture hashes, and full model digests. The case list SHA-256 is `34f24a112c144ac13fdec325aff41efc47784fe832ff12aaca0b8b97a7d05f80`.

## Ollama reasoning disabled

Run `ollama-reasoning-off-2026-11-25T15-24-07-153Z` used Ollama 0.34.0 on Apple M4 Pro with 48 GiB of memory.
Each row used the same 100 distinct facts replayed from recorded Stockfish fixtures. The benchmark warmed each model and used a three-second request timeout. Latency includes fallbacks.

| Ollama model | Prompt | Accepted | Pass rate | Median | p95 | Fallbacks |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `qwen3:1.7b-q4_K_M` | `reasoning_effort: none` | 80/100 | 80.0% | 243 ms | 339 ms | `reveals-better-move` × 17, `too-many-sentences` × 2, `unknown-piece` × 1 |
| `qwen3:4b-q4_K_M` | `reasoning_effort: none` | 65/100 | 65.0% | 597 ms | 860 ms | `disallowed-character` × 1, `reveals-better-move` × 33, `unknown-piece` × 1 |

### Training decision

The best 1.7B result passed 80.0%. It met the [spec 08](specs/08-llm-rephrasing.md) target of 80% and fell below the [spec 13](specs/13-train-coach-model.md) threshold of 90%.
Fine-tuning remains eligible under spec 13.

### Reproduce the run

Start Ollama on loopback, pull both exact tags above, install the locked dependencies with `bun install --frozen-lockfile`, and run `node training/run-baseline.mjs --ollama-no-thinking` from the repository root.
The local output in `training/runs/ollama-reasoning-off-2026-11-25T15-24-07-153Z` contains the case list, per-case outcomes, fixture hashes, and full model digests. The case list SHA-256 is `34f24a112c144ac13fdec325aff41efc47784fe832ff12aaca0b8b97a7d05f80`.
