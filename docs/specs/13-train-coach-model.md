# 13: Train the coach voice model

**Depends on:** 03, 04, 08 (client, prompt builder, validator). Needs the headless coach code, not the UI.

## Goal

Fine-tune a small "Pip voice" model (`pawnpal-pip`, 1.7B–4B). It rewrites engine-confirmed CoachFacts from spec 04 as kid-friendly text for the spec 08 modes: nudge, explain, reveal, praise and hint. It never analyses chess. It should pass the spec 08 validator often enough to be recommended on 8 GB machines. Training is optional. The release does not wait for it.

## Scope

- Measure off-the-shelf models with the spec 08 criterion 9 setup before training. If a small base model passes the validator at least 90% on the eval set and wins human preference, stop. Do not train.
- Keep `training/` at the repo root. The package's `files` list excludes it. Write stages 1–5 and 8 in TypeScript, reusing `src/web/coach/` and `src/shared/`. Use Python managed by `uv` for stages 6–7 in `training/py/pyproject.toml`.
- For each data-producing stage, write JSONL and a `manifest.json` to gitignored `training/runs/<run-id>/<stage>/`. Record input content hashes, parameters, counts and tool versions. Skip a stage on rerun when its manifest input hash matches.
- Add scripts under `training/stages/`:
  1. `01-positions.ts`: stream one monthly Lichess open-database dump (CC0). Keep games where a player is rated about 600–1400. Stop after N games. Optionally add self-play at the pawnpal levels from spec 02. For each kid move, run spec 03 grading and spec 04 detectors with fixed-depth native Stockfish. Use a new UCI-subprocess adapter of spec 01's `EngineTransport` and `EngineClient` interface. The browser uses the WASM worker adapter. Node tests use the in-process adapter. Add `schemaVersion` to output facts.
  2. `02-prompts.ts`: use the shared prompt builder in `src/shared/coach/`. Build the exact spec 08 request for each fact, applicable mode and kid age (6, 8 or 11). Training input must match inference input byte for byte.
  3. `03-teacher.ts`: use the spec 08 client with any OpenAI-compatible endpoint. The suggested default is a large local model, such as Qwen3 30B-A3B MoE on a 48 GB Mac. Re-check model suggestions before the pilot. Use a local teacher or a cloud provider whose terms allow training on its outputs. A cloud teacher is optional; check its terms first. Add the Pip voice guide from `docs/pip-voice.md` (spec 10) and about 20 hand-written gold examples from `training/gold/examples.jsonl` to the teacher prompt. Generate 2–3 candidates per input. Cache them by input hash.
  4. `04-filter.ts`: apply the spec 08 validator's hard rules and the spec 04 wording rules, then remove near-duplicates. Keep 1–2 valid candidates per input.
  5. `05-split.ts`: split by game, not example. Use 90% train, 5% validation and 5% test. Add a human-reviewed 300-item gold eval set at `training/gold/eval.jsonl` and commit it.
  6. `06-finetune.py`: use `mlx-lm` LoRA on Apple Silicon. Suggested base models are Qwen3 1.7B (small tier) and 4B. Re-check model suggestions before the pilot. Disable thinking in the chat template. Use LoRA rank 16, alpha 32, attention and MLP modules, and learning rate 1e-4. Train for 2–3 epochs with masked prompt tokens. Stop early on validation loss. Target 10k–20k examples after filtering. Run a 500-example pilot end to end before scaling.
  7. `07-export.py`: fuse the adapter, convert it with llama.cpp to GGUF, quantize to Q4_K_M and Q8_0, create an Ollama Modelfile and run `ollama create pawnpal-pip:<size>`.
  8. `08-evaluate.ts`: compare the base model, trained Q4 and Q8 models, and teacher on the test split and gold set. Measure validator pass rate, wording-rule pass rate, median and p95 latency, output length, variety (distinct-n), and blind human preference on 50 pairs. Write results to `docs/llm-models.md`.
  9. `09-publish.md`: checklist for Hugging Face (GGUF, adapter and model card with data provenance and licenses) and the Ollama registry. Spec 09's `recommended-models.json` lists `pawnpal-pip` first only for tiers that pass the gates.

## Out of scope

A model that calculates chess, new fact kinds, other languages, cloud training jobs, shipping weights in the npm package, and replacing the template path.

## Design

**Data flow**

```text
Lichess PGN → positions + facts → prompts → teacher candidates → filtered pairs → splits → LoRA → GGUF/Ollama → evaluation → publish
```

**Schema coupling.** Each `CoachFact` has a `schemaVersion`. A model tag names the schema version it was trained on, such as `pawnpal-pip:1.7b-facts1`. A schema change requires retraining. The app recommends only a model trained on the matching schema version.

**Reuse.** Use spec 03's `grade.ts`, spec 04's detectors, and the spec 08 client, prompt builder and validator. The spec 08 implementation must put the prompt builder in `src/shared/coach/`, next to `validateRephrase.ts`.

**Licenses.** Qwen3 is Apache-2.0 and the Lichess database is CC0. Use teacher outputs only from a local model or a provider whose terms allow training on those outputs. Qwen3 model choices are suggestions. Re-check them before the pilot.

**Ship gates.** A trained small model must pass the validator at least 95% of the time and score at least 15 points above the base model. If the base model already passes at least 90%, do not ship a trained model. Q4 must be within 3 points of full precision. The trained model must be preferred over the base model on at least 60% of the 50 blind pairs.

## Acceptance criteria

1. Record the baseline and gate decision in `docs/llm-models.md` before training.
2. A rerun with unchanged inputs does no work.
3. Stage 2 output is byte-equal to the request the spec 08 server would send. A test checks this.
4. A fixture test confirms that stage 4 drops a planted bad candidate.
5. A test confirms that train, validation and test splits have no game IDs in common.
6. The 500-example pilot produces an Ollama model that answers one fixture prompt.
7. The evaluation report includes every metric for the base model, Q4, Q8 and teacher.
8. Evaluate the ship gates mechanically and record the results.
9. Published artifacts include the model card and schema version. `recommended-models.json` lists `pawnpal-pip` only for tiers that pass the gates.

## Test plan

- **Unit:** manifest and resume behavior, rating filter, split by game, filter fixtures and prompt byte equality.
- **Manual:** run the pilot, review the gold set and check human preference on 50 pairs.

## Open questions

- Is a cloud teacher worth using given its terms?
- Should there be one model per age band?
- Should spec 09 probe installed Ollama models for `pawnpal-pip`? Edit spec 09 when spec 13 lands.
- Should `docs/pip-voice.md` land earlier?
