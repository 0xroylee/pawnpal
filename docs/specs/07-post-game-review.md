# 07: Post-game review

**Depends on:** 04, 06

## Goal

After each game, Pip walks the kid through up to five key moments in under a minute. Past games can be browsed the same way.

## Scope

**Picking key moments** (from the stored analyses)
- **Candidates:**
  - kid moves graded mistake or blunder that stood
  - "You fixed it!" moments, where Try again led to a better move
  - `isOnlyMove` and `played-fork` moves
- **Ranking:**
  1. blunders by drop, largest first
  2. mistakes
  3. fixed-it moments
  4. great moves
- **Limits:** at most 5. If any great move exists, at least one is included. Moments are shown in game order.
- **Clean game** (no standing mistakes or blunders): a celebration screen plus the best great move, if there is one.

**Review screen**
- Board at the moment's position, before the kid's move.
- The kid's move as an orange arrow; the better move as a green arrow.
- Coach text from the explain and reveal templates (or praise for great moves). Spec 08 rewords it when an LLM is connected.
- Previous / Next, and Done.
- "See whole game": move list with a grade icon on each kid move. Tapping a move shows that position.

**Summary card:** result; counts of great, good, mistakes and blunders; hints used. Stars appear once spec 10 lands.

**Entry points:**
- The end-of-game banner, "Let's look at your game with Pip", which can be skipped.
- The game history list in the profile.

## Out of scope

- Playing on from a review position, or "find the better move" practice (v2 puzzles).
- Analysis of the opponent's moves.
- Eval graph.

## Acceptance criteria

1. Key-moment selection matches a table of analysis arrays → expected moments, including the clean-game case and the 5-moment cap.
2. A 60-move game from history opens its review within 500 ms. No engine run is needed because the analysis is stored.
3. Plies with no stored analysis (late grades) are skipped without errors.
4. Arrows and highlights match each moment's facts.
5. Skip and Done return to the home screen.
6. Opening a past game from history shows the same review as right after the game.

## Test plan

- **Unit:** moment selection table; summary counts.
- **End-to-end:** play a scripted game from `?fen=` with one blunder and one fixed mistake, then check both moments, the arrows and the navigation; reopen the game from history.

## Open questions

- Whether to read the whole review aloud automatically or one moment at a time (spec 10). Leaning towards one moment at a time.
