# Local coach training tools

The Node stages grade games with Stockfish, generate prompts, filter candidate replies, and split examples by game. Run them with synthetic fixtures or a teacher endpoint you configure. The Python stages fine-tune a local Qwen3 model and export it to Ollama. [Fine-tuning and export commands](py/README.md)

## Build and run

Install the locked dependencies and build the stages. Run the stage commands through Bun so they use Node.js for Stockfish WASM and PGN decompression.

```sh
bun install --frozen-lockfile
bun run training:build
```

Stages write data and manifests below `training/runs/<run-id>/<stage>/`. A completed stage is skipped when its file and directory contents, values, parameters, tool versions, code bundle, lockfile, and output hashes match its manifest. Stage outputs and manifests are written to a temporary sibling and renamed after the complete write. Use a new run directory when starting a separate pipeline.

```sh
bun run node training/dist/01-positions.mjs \
  --input /path/to/games.pgn.zst \
  --run-dir training/runs/pilot-001 \
  --limit 500 \
  --engine-uci /path/to/stockfish

bun run node training/dist/02-prompts.mjs \
  --input training/runs/pilot-001/01-positions/positions.jsonl \
  --run-dir training/runs/pilot-001 \
  --model <model-id>

bun run node training/dist/03-teacher.mjs \
  --input training/runs/pilot-001/02-prompts/prompts.jsonl \
  --run-dir training/runs/pilot-001 \
  --voice-guide <approved-voice-guide.md> \
  --base-url <approved-openai-compatible-endpoint> \
  --model <teacher-model-id> \
  --n 2

bun run node training/dist/04-filter.mjs \
  --input training/runs/pilot-001/02-prompts/prompts.jsonl \
  --candidates training/runs/pilot-001/03-teacher/candidates.jsonl \
  --run-dir training/runs/pilot-001

bun run node training/dist/05-split.mjs \
  --input training/runs/pilot-001/04-filter/filtered.jsonl \
  --run-dir training/runs/pilot-001 \
  --seed 130417

bun run node training/dist/08-evaluate.mjs \
  --input <evaluation-metrics.json> \
  --run-dir training/runs/pilot-001
```

Stage 01 also accepts `.pgn` files and `--input -` for PGN from stdin. On Node 22.15 or later, `.pgn.zst` files are decompressed in the stage. If Node does not provide zstd support, pipe decompressed PGN to stdin. Stage 01 accepts a UCI executable path through `--engine-uci`; omitting it selects the local Stockfish WASM engine.

Stage 01 records engine inputs by content. For UCI engines, the resolved executable, UCI banner, and each path supplied with `--engine-assets path1,path2` are included in the stage identity. Directory assets are hashed recursively. A script requires at least one declared asset or an operator label supplied with `--engine-identity <label>`; its interpreter, imports, wrapped binary, and networks cannot be discovered automatically. For a binary, declare external networks with `--engine-assets` and material environment or CPU settings with `--engine-identity`. The UCI name remains display metadata and does not identify engine contents. Bare command names are resolved through POSIX `PATH`; Windows `PATHEXT` lookup is not supported. The WASM engine identity includes the Stockfish loader, selected `.js` and `.wasm` files, package metadata, and the repository lockfile. Avoid pointing `--engine-assets` at large directories because every regular file is hashed.

For a local fixture run without a teacher endpoint, stage 03 accepts `--fixture-candidates training/fixtures/candidates.jsonl` and does not create an LLM client. Stage 01 uses the fake engine with `--engine-uci training/test/fake-uci.mjs --engine-assets node_modules/chess.js`. Stage 03 stores each successful teacher candidate in append-only `progress.jsonl`; retries reuse saved successes, and a torn final progress record is removed before resuming. `candidates.jsonl` is replaced atomically after a complete pass, so an interrupted retry leaves the last complete candidate output in place. The fixture pipeline uses `training/fixtures/games.pgn`, `training/test/fake-uci.mjs`, and `training/fixtures/eval-numbers.json`. The last file is marked fixture-only and contains no real measurements.

Stage 04 keeps the inference request messages beside each accepted completion. Stage 05 writes `train.jsonl`, `valid.jsonl`, and `test.jsonl` with one `messages` array per row, plus matching `.meta.jsonl` files containing the row id and game, mode, and age metadata. Stage 06 uses the train and validation chat rows with MLX-LM 0.32.2. Keep the test split for evaluation.

## Repeat the offline fixture pipeline

Run these commands from the repository root. The fixture teacher applies each planted candidate to each prompt; it makes no network requests. Use a fresh run directory for a separate experiment. Run the same commands a second time to check that each stage reports `skipped: true`.

```sh
bun run training:build
bun run node training/dist/01-positions.mjs --input training/fixtures/games.pgn --run-dir training/runs/fixture-001 --engine-uci training/test/fake-uci.mjs --engine-assets node_modules/chess.js
bun run node training/dist/02-prompts.mjs --input training/runs/fixture-001/01-positions/positions.jsonl --run-dir training/runs/fixture-001 --model fixture-model
bun run node training/dist/03-teacher.mjs --input training/runs/fixture-001/02-prompts/prompts.jsonl --run-dir training/runs/fixture-001 --fixture-candidates training/fixtures/candidates.jsonl
bun run node training/dist/04-filter.mjs --input training/runs/fixture-001/02-prompts/prompts.jsonl --candidates training/runs/fixture-001/03-teacher/candidates.jsonl --run-dir training/runs/fixture-001
bun run node training/dist/05-split.mjs --input training/runs/fixture-001/04-filter/filtered.jsonl --run-dir training/runs/fixture-001 --seed 138
```

Seed 138 deterministically assigns the existing fixture games to all three splits with the production ratios. The synthetic duplicate pair differs only in punctuation, and the planted Nxg3 move matches a generated hint fact; other prompts may reject it for a different reason.

Stage 01 accepts optional `--min-rating` and `--max-rating` (defaults 600 and 1400). Fixture candidates are synthetic, not teacher responses. The fixture file is hashed in the manifest; changing it reruns the stage. Real teacher progress is cached by prompt and teacher inputs and survives a retry; use a new run directory to isolate provenance. Real teacher runs use no gold examples unless `--gold` is supplied. The old files in `training/gold/` are unreviewed placeholders and must not be supplied for real teaching.

## Evaluate a trained model

Use the app's validator and three-second timeout to measure replies on a held-out set. Stage 08 takes measured metrics and human preference results as JSON and writes `report.md` and `gates.json` under the run directory. The numeric fixture illustrates the input format. [Evaluation input fixture](fixtures/eval-numbers.json)

The local pilot report lists the compared models, exact settings, measured scores, and release decision. Spec 13 also calls for a human-reviewed gold set and blinded preference votes. The files in `training/gold/` are placeholders. [Pilot results](../docs/llm-models.md#local-pip-fine-tuning-pilot) · [Spec 13](../docs/specs/13-train-coach-model.md)

## Local self-play

After building, run `bun run node training/dist/00-selfplay.mjs --run-dir training/runs/selfplay --games 2 --ply-limit 8 --seed 1 --openings 1`. Games must be even and at least 2; ply limit and openings must be at least 1 (at most 50 openings). The stage writes `00-selfplay/games.pgn` and `manifest.json`. Levels 4–7 use the approximate Spec 02 targets; capped games are draws. Repeat the command to reuse matching output. Feed the PGN to stage 01; longer games are needed for useful positions. The packaged local WASM engine and calibration openings require no download.
