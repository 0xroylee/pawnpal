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

## Local Pip fine-tuning pilot

Run `trained-pilot-eval-2026-11-26T07-02-57-920Z` tested 100 recorded Stockfish fixture cases and 100 distinct cases from 22 held-out self-play games. The held-out cases exclude training and validation facts. All four models saw each case in the same order through Pawnpal's validator. Ollama 0.34.0 ran on loopback on an Apple M4 Pro. Each model warmed up before timing. The run used the experimental prompt v3, reasoning disabled, exact stock sampling parameters, and the app's three-second timeout. Timeouts count as failures.

### Results

| Cohort | Model | Validator | Wording | Median | p95 | Mean characters | Distinct bigrams | Fallbacks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Fixtures | Stock Q4 | 87/100 | 66% | 238 ms | 330 ms | 91 | 0.39 | `disallowed-character` × 5, `too-many-sentences` × 4, `unknown-piece` × 4 |
| Fixtures | Matched untrained Q4 | 94/100 | 76% | 185 ms | 259 ms | 60 | 0.32 | `disallowed-character` × 1, `too-many-sentences` × 3, `unknown-move` × 2 |
| Fixtures | Trained Q4 | 98/100 | 100% | 166 ms | 239 ms | 53 | 0.26 | `unknown-piece` × 2 |
| Fixtures | Trained F16 | 98/100 | 98% | 261 ms | 452 ms | 54 | 0.21 | `unknown-piece` × 2 |
| Held-out | Stock Q4 | 87/100 | 51% | 249 ms | 358 ms | 104 | 0.33 | `disallowed-character` × 3, `too-many-sentences` × 7, `unknown-piece` × 2, `unknown-square` × 1 |
| Held-out | Matched untrained Q4 | 96/100 | 76% | 198 ms | 256 ms | 71 | 0.27 | `too-many-sentences` × 3, `unknown-piece` × 1 |
| Held-out | Trained Q4 | 99/100 | 98% | 171 ms | 247 ms | 55 | 0.22 | `unknown-piece` × 1 |
| Held-out | Trained F16 | 100/100 | 99% | 240 ms | 471 ms | 57 | 0.21 | None |

Wording and diversity use the candidate text before fallback. A missing candidate counts as a wording failure and has length zero. With stochastic sampling, repeated runs can differ by a few cases.

### Decision

Trained Q4 met the [Spec 13](specs/13-train-coach-model.md) 95% validator floor. It improved by 4 points on fixtures and 3 points on held-out games over the matched untrained model. Even against the stock tag, its gains were 11 and 12 points. The release gate requires 15 points. Q4 was within one point of the pilot F16 export, which came from a dequantized 4-bit checkpoint. A comparison against the original BF16 weights remains open.

The stock tag passed 87% of fixtures and 87% of held-out cases, above the [Spec 08](specs/08-llm-rephrasing.md) 80% target. The matched untrained export passed 94% and 96%. It cleared the 90% cutoff for human preference review. Its 50 blinded comparisons against the built-in replies are in `preference.md`. The skip-training decision is pending votes. Spec 13 also requires Q8 and a reviewed gold set for a release.

### Run details

- MLX-LM 0.32.2 trained rank-16 QLoRA for two epochs and 500 optimizer steps, with 500 training and 45 validation examples. Training targets included 239 validator- and wording-checked replies from the local 4B teacher and 261 built-in replies. Another 45 examples came from disjoint test games.
- Stockfish 19 generated 48 self-play games using seed `1317` and 24 openings. The split used seed `130417`. The data and cohort manifests record game provenance and input hashes.
- The original BF16 weight download timed out. The pilot used `Qwen/Qwen3-1.7B-MLX-4bit` revision `21457c6f51ed54a7c16e988c0844db973815c137`, with the original Qwen3 tokenizer template from revision `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`. Six prepared chat examples matched the pinned Ollama Go template at the token boundary.
- Ollama 0.34 rejects direct Qwen3 safetensors imports. The bridge used llama.cpp `b12756`, PyTorch 2.15.0, NumPy 2.5.5, and Transformers 5.24.1 to make F16 and Q4_K_M GGUFs. The matched control used the same conversion and Q4 quantization without the adapter. The scored variants include the stock tag's explicit `repeat_penalty 1`.
- Go template SHA-256 is `ae370d884f108d16e7cc8fd5259ebc5773a0afa6e078b11f4ed7e39a27e0dfc4`. Adapter SHA-256 is `26678b452e0dd0b4dabb4c82630aab02ee1df21af167e9bf085e962891e89975`. Fixture and held-out case-file SHA-256 values are `34f24a112c144ac13fdec325aff41efc47784fe832ff12aaca0b8b97a7d05f80` and `83a942314a97c02927b3948d05d53278c19353dc209908587661247da20be844`.

| Local model tag | Ollama digest |
| --- | --- |
| `qwen3:1.7b-q4_K_M` | `8f68893c685c3ddff2aa3fffce2aa60a30bb2da65ca488b61fff134a4d1730e7` |
| `qwen3:pilot-control-stock-1126` | `45099e685469b67cd66386a6820bc422c20e5f5112fd7ceef93ae53b61fea5f2` |
| `qwen3:pilot-pawnpal-q4-stock-1126` | `4db891c3364ace16f3fd37052f9114899dffe58e1b2b163f03410007f1689620` |
| `qwen3:pilot-pawnpal-full-stock-1126` | `8c271318ee42d97099f4ad6ec43902cd7c650c9c40ee148ec4206a645541179c` |
| `qwen3:4b-q4_K_M` (teacher) | `2bfd38a7daaf4b1037efe517ccb73d1a3bbd4822cf89f1a82be1569050a114e0` |

The benchmark worktree `pip-training-pilot` holds `training/runs/trained-pilot-eval-2026-11-26T07-02-57-920Z/` with the exact case lists, per-case outcomes, manifests, blinded sheet and local evaluator commands. The data worktree `pip-training-data` holds the adapter, split, GGUFs and import evidence in `training/runs/pilot-live-001/`. The toolchain manifest and packaged dependency versions are in `training/runs/toolchain-001/`.
