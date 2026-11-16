# 03: Move grading

**Depends on:** 01

## Goal

Grade every kid move within about one second, using engine evaluations, so the coach knows when to speak and has the raw material for an explanation.

## Scope

- `src/web/coach/winChance.ts`: centipawns or mate score → win chance (0–100).
- `src/web/coach/grade.ts`: before and after analysis → `MoveAnalysis`.
- Analysis pipeline on the `analyst` engine:
  - **When it becomes the kid's turn:** analyze the position with MultiPV 3 to depth 14, capped at 1.5 s. This runs while the kid is thinking.
  - **When the kid moves:** stop the pre-move analysis if it's still running (see criterion 4). Then analyze the new position with MultiPV 2 to depth 12. This finds the opponent's best reply, which spec 04 uses for threats.
- The game reducer adds a `grading` state between the kid's move and the opponent's reply. The opponent waits for the grade so that spec 05 can step in before it moves.
- If grading isn't done 1.5 s after the kid's move, the opponent moves anyway and the grade arrives late. A late grade can still produce a coach message, but never a Try again.
- Analyses are stored in game state, indexed by ply, for the review (07) and for saving (06).
- Dev-only debug panel (`PAWNPAL_DEV=1`) shows eval, win chance, drop and grade for each move.

## Out of scope

Facts and coach text (spec 04). Analysis of the opponent's moves.

## Design

**Perspective.** Engine scores are relative to the side to move. Convert every score to the kid's perspective before doing anything else.

**Win chance** (Lichess formula):

```
cp' = clamp(cp, -1000, 1000)
win = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp')) - 1)
```

A mate for the kid gives 100; a mate against the kid gives 0.

**Drop** = `winBefore` (from the best line before the move) − `winAfter` (from the analysis after the move).

**Grade thresholds** (initial values, kept in one config file):

| Grade | Rule |
|---|---|
| best | The kid played the top line's move, or drop < 2 |
| good | drop < 5 |
| inaccuracy | 5 ≤ drop < 10 |
| mistake | 10 ≤ drop < 15 |
| blunder | drop ≥ 15 |

These match Lichess's cutoffs (0.1 / 0.2 / 0.3 in winning chances). They'll be tuned with real kid games.

**Adjustments**
- **Still clearly winning:** if `winAfter` ≥ 85, the grade is capped at inaccuracy, so the coach doesn't nag a kid who is far ahead.
- **Great move:** set `isOnlyMove` when the kid played the top move and the second-best line's win chance is at least 15 lower.

## Acceptance criteria

1. `winChance` matches reference values: cp 0 → 50.0; cp +100 → 59.1 (±0.1); cp −300 → 24.9 (±0.1); mate for the kid → 100; mate against → 0.
2. A fixture suite of at least 30 positions (FEN + kid move + expected grade) passes. It covers a hanging queen → blunder, a normal opening move → best or good, a missed mate-in-1 → blunder, an only move found → `isOnlyMove`, and the "still clearly winning" cap. Every fixture is checked from both White's and Black's side.
3. In a scripted 40-move game on the single-threaded build on a 2020-era laptop, 95% of grades are ready within 1 s of the kid's move.
4. If the kid moves before the pre-move analysis finishes, the pipeline uses its best result so far if that reached depth 8. Otherwise it re-runs to depth 8.
5. The opponent never moves before the grade arrives, unless the 1.5 s cap is hit.
6. Every graded ply is stored and can be read back from game state.

## Test plan

- **Unit:** `winChance`; threshold table with made-up engine lines; perspective flip for Black; the winning cap; the `isOnlyMove` rule.
- **Fixture tests:** real Stockfish WASM, single thread, fixed depth (deterministic).
- **End-to-end:** start from a `?fen=` position, hang the queen, and check that the debug panel shows "blunder".

## Open questions

- Whether pre-move analysis should run deeper on fast machines (multi-threaded build).
