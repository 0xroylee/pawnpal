# Difficulty calibration

Run this check before a release from the repository root with Node 22 and the locked dependencies.

```sh
bun install --frozen-lockfile
node tools/calibrate/run.mjs
```

The run plays 1,600 games in single-threaded Stockfish WASM. Every pairing uses 50 openings, both colors, and two repeats per color. The report goes to `tools/calibrate/results/<date>.md`. The command exits with an error if an adjacent level scores below 60% or Dragon scores outside 40–60% against the Stockfish 1320 anchor. GitHub Actions can run the same check through the **Difficulty calibration** workflow.

Use `--workers N` to limit parallel games. For a pilot, use `--openings 5 --repeats 1`. Pilot reports carry a separate filename and do not determine whether a release passes.
