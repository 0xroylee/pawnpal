# 05: Try again

**Depends on:** 04

## Goal

When the kid makes a mistake or blunder, they can take it back and look again. The coach's nudge points at the problem without giving away the answer.

## Scope

- Try-again states in the game reducer.
- Nudge and reveal UI in the coach bubble: buttons, arrow, the piece animating back on undo.
- Per-move attempt records saved with the game.
- A per-profile setting, "Offer Try again" (on by default). The setting is stored in spec 06 and exposed to parents in spec 09; before then it's a constant.

## Out of scope

Take-backs for good moves. Undoing more than one move.

## Design

**Flow**

```
KidToMove ──move──► Grading ──best / good / inaccuracy──► OpponentToMove
                       │
                       └── mistake / blunder ──► Nudge
Nudge   (nudge text + highlights)    [Try again] [Show me] [Keep my move]
  Try again    → undo the kid's move → Retry (kid to move, attempt 2)
  Show me      → Reveal
  Keep my move → explain text → OpponentToMove
Retry ──move──► Grading
  ├── best / good / inaccuracy → "That's better!" → OpponentToMove
  └── mistake / blunder        → Reveal
Reveal  (explain + reveal text + green arrow)    [OK]
  OK → kid to move. The next move is not intercepted.
```

**Rules**
- Only mistakes and blunders start the flow. The opponent waits for as long as it lasts.
- At most two interceptions per turn: the first move and one retry. After Reveal, the kid's next move goes through without interception.
- If the retry is the same move as the original mistake, treat it as Keep my move.
- A late grade (from spec 03's 1.5 s cap) never offers Try again. The coach shows explain text after the fact.
- With "Offer Try again" turned off, the coach shows explain text after the move, and play continues.
- **Game record:** the PGN keeps only the moves that stand. Each kid move's `MoveAnalysis.attempts` records:
  - each taken-back move (UCI, SAN, grade)
  - whether Show me was used
  - whether a Reveal happened

## Acceptance criteria

1. A blunder opens Nudge with nudge text, highlights and the three buttons. The opponent doesn't move.
2. Try again animates the piece back and returns to kid-to-move with the same position.
3. A good retry shows "That's better!", and the opponent then replies.
4. A second mistake opens Reveal with a green arrow for the best move.
5. Show me goes straight to Reveal.
6. Keep my move shows explain text, and the opponent then replies.
7. Repeating the original mistake on the retry behaves like Keep my move.
8. A late grade never shows Try again.
9. With the setting off, nothing is intercepted and explain text appears after the move.
10. The saved PGN has only the standing moves, and `attempts` records each taken-back move.
11. Nudge text never contains the better move (checked against every template variant).

## Test plan

- **Unit:** reducer transitions for each path; attempt records; the same-move rule; late-grade guard.
- **End-to-end:** from a `?fen=` position:
  - blunder → Try again → blunder → Reveal → play the best move → game continues
  - Keep my move path
  - Show me path
  - setting-off path

## Open questions

- Whether "Try again" should count against the stars in spec 10. Current answer: no; only blunders that stand count.
