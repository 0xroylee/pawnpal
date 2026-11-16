# 04: Coach: facts, templates, hints

**Depends on:** 03

## Goal

When a kid makes a mistake or blunder, Pip says in one or two short sentences what went wrong and points at the board. Every sentence is backed by an engine-confirmed fact. The kid can ask for a hint at any time.

## Scope

- Detectors in `src/web/coach/detectors/`. Each is a pure function `(ctx: DetectorContext) → CoachFact[]`, where `ctx` holds the board before the move, the kid's move, the board after, and the `MoveAnalysis`.
- A static exchange evaluation helper `see(board, square)` on chess.js boards.
- Fact priority and selection: one fact per message. All facts are kept on the `MoveAnalysis` for the review.
- Templates in `en.json`, with 2–3 variants per message. They use piece names, not coordinates, plus board annotations (highlighted squares and arrows).
- Coach bubble beside the board, with a placeholder Pip icon until spec 10.
- When the coach speaks:
  - **Mistake or blunder:** one message.
  - **`isOnlyMove`:** a short praise line, at most once every 5 kid moves.
  - **Anything else:** silent.
- Hint button with three tiers.

Until spec 05 lands, the coach shows explain + reveal text after a mistake, with no take-back.

## Out of scope

Try-again flow (05), LLM wording (08), pins, skewers, discovered attacks, opening tips.

## Design

**Material values:** pawn 1, knight 3, bishop 3, rook 5, queen 9.

**Detectors**

| Kind | Fires when | Fact data |
|---|---|---|
| `allowed-mate` | After the kid's move, the opponent has mate in ≤ 3 and didn't before | First mating move, mate distance |
| `missed-mate` | Before the move, the kid had mate in ≤ 2, and the move loses it or makes it longer | The mating move |
| `hanging-piece` | The opponent's best reply captures a kid piece and SEE on that square gains the opponent ≥ 2 | Piece, its square, the capturing move |
| `allowed-fork` | The opponent's best reply attacks two or more kid pieces worth ≥ 3 (or the king plus a piece), and the engine line wins material within 4 plies | Forking piece, targets |
| `missed-capture` | The best move before was a capture with SEE ≥ 2, and the kid didn't play it | The capture, the target piece |
| `missed-fork` | The best move before was a fork (same definition), and the kid didn't play it | The forking move, targets |
| `threat` | Fallback when nothing above fires: the opponent's best reply and what it captures or attacks | Reply move, target |
| `played-fork` | The kid's own move is a fork that the engine line confirms (used for praise and spec 10's badge) | The fork move, targets |

**Engine confirmation rule.** A fact is only emitted when the engine line agrees with it. For example, a "hanging" piece must actually be captured in the principal variation within 2 plies, and the material balance along that line must drop by about the piece's value. A piece that only *looks* loose but is defended tactically produces no fact.

**Priority:** `allowed-mate` > `missed-mate` > `hanging-piece` > `allowed-fork` > `missed-capture` > `missed-fork` > `threat`.

**Templates.** Each fact kind has four message modes, which spec 05 uses in its flow:
- `nudge`: points at the problem and doesn't name the better move.
  > "Uh-oh, is your {piece} safe there? Look at who can reach it."
- `explain`: says what happens.
  > "Your {piece} can be captured by the {attacker} now."
- `reveal`: names the better move, with a green arrow on the board.
  > "Moving your {betterPiece} here keeps everything safe."
- `praise`, for `isOnlyMove` and `played-fork`:
  > "Great find! That was the only good move."

**Annotations.** Each fact maps to highlights and arrows. A piece in danger is red; the attacker is orange; the opponent's threat is a red arrow. The better move gets a green arrow, in reveal mode only.

**Wording rules** (enforced by a test over `en.json`):
- No board coordinates and no numbers in template text.
- At most 25 words per sentence.
- Second person ("you", "your").
- No blame words such as "bad", "terrible" or "stupid".

**Hint tiers** (for the current position, from the pre-move analysis):
1. Highlights the piece that moves in the best line: "Take a look at your knight."
2. Names the idea using the detectors in "what would the best move do" mode: "There's a way to win a piece!" or "You can give checkmate!"
3. Shows the best move as a green arrow.

Each tap moves up one tier, and the tier resets after the kid moves. The highest tier used is stored on that move's `MoveAnalysis.hintTier`.

## Acceptance criteria

1. The fixture suite passes:
   - at least 8 positive positions per detector
   - at least 20 negative positions where no fact should fire, including pieces that look loose but are defended tactically
2. No emitted fact contradicts the engine line (covered by the negative fixtures).
3. On the template path, the coach message appears within 300 ms of the grade.
4. On a mistake or blunder, the bubble shows exactly one message with matching highlights. On an `isOnlyMove` move, it praises (rate-limited). Otherwise it stays silent.
5. Every message mode of every fact kind has at least 2 variants, and the same variant never appears twice in a row.
6. All template text passes the wording-rules test.
7. Hint tier 1 highlights only the moving piece. Tier 3 shows the arrow. Tiers reset after a move.
8. End-to-end: a scripted `?fen=` position plus a kid move shows the expected message and highlights for each detector kind.

## Test plan

- **Unit:** `see()`; each detector against its fixtures; priority selection; template rendering and variant rotation; wording rules; hint tiers.
- **End-to-end:** one scripted position per detector kind.

## Open questions

- Whether to comment on inaccuracies at the higher levels (as a parent setting). Leaning towards v2.
