# 02: Difficulty levels

**Depends on:** 01

## Goal

Eight named levels, from a first-week beginner to about 1300. Each level reliably beats the one below it, and the engine's mistakes look like a person's mistakes, not random moves.

## Background

Stockfish's `UCI_LimitStrength` / `UCI_Elo` can't go below 1320, and `Skill Level 0` is still too strong for most young beginners. Below that range pawnpal picks the engine's move itself.

## Scope

- `src/web/engine/levels.ts`: the level table and `chooseMove(fen, level, rng) → uci`.
- Level picker on the game setup screen: name, one-line description, and 1–8 difficulty stars. No rating numbers in the UI. After spec 06, the profile's current level is preselected.
- Calibration tool in `tools/calibrate/`: headless matches in Node using Stockfish WASM, which write a Markdown report.

## Out of scope

- Level suggestions after win/loss streaks (spec 06).
- Changing difficulty in the middle of a game.

## Design

**Move selection for levels 1–7**
1. The opponent engine scores candidate moves with MultiPV k at shallow depth d.
2. With probability `pSlip`, the engine plays a *slip*: a move whose loss is within a plausible range (`slipMinCp`–`slipMaxCp`, such as leaving a pawn or piece loose). Levels 1–2 allow any legal move as a slip.
3. Otherwise it samples from the candidates with softmax over centipawns at temperature T.
4. At levels 1–3 captures get a small bonus in sampling, because beginners grab material.
5. At levels 3 and up, the engine always plays mate-in-1 when it has one.

**Level 8** uses Stockfish's own limit: `UCI_LimitStrength=true`, `UCI_Elo=1350`.

**Starting table** (to be tuned by calibration):

| Lvl | Name | Target | k | d | T (cp) | pSlip | Capture bonus |
|---|---|---|---|---|---|---|---|
| 1 | Sleepy Snail | ~250 | 20 | 1 | 300 | 0.35 | +150 |
| 2 | Curious Kitten | ~400 | 20 | 2 | 200 | 0.25 | +100 |
| 3 | Busy Beaver | ~550 | 12 | 3 | 150 | 0.18 | +50 |
| 4 | Clever Fox | ~700 | 8 | 4 | 100 | 0.12 | 0 |
| 5 | Wise Owl | ~850 | 6 | 6 | 70 | 0.08 | 0 |
| 6 | Brave Bear | ~1000 | 5 | 8 | 45 | 0.05 | 0 |
| 7 | Mighty Lion | ~1150 | 4 | 10 | 25 | 0.03 | 0 |
| 8 | Dragon | ~1350 | — | — | — | — | UCI_Elo 1350 |

- `chooseMove` takes an injected RNG so tests are deterministic.
- On the single-threaded build, a move takes at most 1 s at every level, so tablets stay responsive.

**Calibration (`tools/calibrate/`)**
- Opening set: 50 positions after 4–6 plies of common openings. Each pairing plays every opening with both colors.
- Adjacent levels: level n+1 vs level n, 200 games. Pass when n+1 scores at least 60%.
- Anchor: level 8 vs Stockfish `UCI_Elo=1320`, 200 games. Pass when the score is 40–60%.
- Writes `tools/calibrate/results/<date>.md` with scores and the table values used.
- Absolute ratings below 1320 can't be anchored precisely. The report says so, and the UI shows only names and stars.

## Acceptance criteria

1. All 8 levels can be picked. The choice carries over to the next game (localStorage until spec 06).
2. The calibration report shows every adjacent pair at 60% or more.
3. Level 8 scores 40–60% against `UCI_Elo=1320`.
4. On fixture positions where a free queen can be taken, levels 3 and up take it at least 95% of the time.
5. Levels 3 and up always play an available mate-in-1 (fixture suite).
6. With a seeded RNG, `chooseMove` gives the same move for the same input.
7. No level takes longer than 1 s per move on the single-threaded build (2 s allowance on CI hardware).

## Test plan

- **Unit:** softmax sampling and slip selection with fake engine lines and a seeded RNG; capture bonus; mate-in-1 override.
- **Fixture tests (real WASM engine):** free-queen and mate-in-1 positions, and timing per level.
- **Calibration:** too slow for every PR. It runs as a manual `workflow_dispatch` CI job and before each release.

## Open questions

- Final level names and art (shared with spec 10).
- Tune T, `pSlip` and the slip range from the first calibration run.
