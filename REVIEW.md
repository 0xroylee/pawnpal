# Reviewing a Pawnpal change

Use this for every change, whether a person or an agent wrote it. Review against two things: the spec the change claims to implement, and the standards in [AGENTS.md](AGENTS.md) and the [code patterns](docs/agents/code-patterns.md). Start with the blockers. A change with a blocker goes back no matter how clean the rest is.

## Blockers

Any one of these sends the change back.

- A coach message, grade, arrow or square that doesn't come from engine lines or a chess.js check. Trace one new message end to end, from the detector through the template to the bubble.
- An LLM reply that can reach the kid without passing `validateRephrase`, or a new code path where the kid waits on the model before seeing the template text.
- A new outbound request, or new data in the LLM request. The kid's name, games and database never leave the machine.
- A text field, free-form input, or paste target on a kid screen.
- A user-facing string outside `src/web/i18n/en.json`, including `aria-label`, `title` and `alt`.
- An async result that reaches the reducer without a `turnToken` or `gameToken` check.
- A server route that reads a body without `jsonBody()` and a zod schema, or a parent route that skips `ParentGate`.
- A change under `design/assets/pieces/horsey/`, a hand-edited generated file, or a new dependency without updated `THIRD_PARTY_NOTICES`.
- A test, fixture threshold or validator rule loosened to make the change pass.

## Spec

- Name the spec in `docs/specs/` the change belongs to. The [feature map](docs/agents/feature-map.md) lists them. If none fits, ask whether the change belongs in v1.
- Walk the acceptance criteria the change touches and confirm each one has a test or a recorded manual check.
- Check the spec's out-of-scope list and the overview's. Out-of-scope features need a decision, not a review.
- When the change alters behavior a spec describes, the spec changes in the same diff.

## Chess and coaching

- Detectors return no fact when the engine lines don't prove the claim. Look for a quiet fixture next to every new positive one.
- One fact per message. Every fact stays on the `MoveAnalysis` for the review screen.
- New templates have 2 or 3 variants, use piece names instead of coordinates, and follow [Pip's voice](docs/pip-voice.md). Nudges and hints never name the better move.
- Pip stays quiet on inaccuracies and good moves. Praise appears on only moves, at most once every 5 kid moves.
- Changes to grade thresholds, level tables or `chooseLimitedMove` come with updated fixtures or a new calibration report in `tools/calibrate/results/`.
- A change to the `CoachFact` shape bumps `COACH_FACT_SCHEMA_VERSION` and updates the prompt builder, validator and training cases together.

## Code

- The code matches its neighbors: named exports, `type` aliases, string unions instead of enums, no `any`, import extensions that match the folder.
- Chess logic in `src/web/coach/` and `src/shared/` is pure and has no React. Time, randomness, `fetch` and the engine arrive as parameters.
- Components don't call the engine or `fetch`. They go through hooks and clients in `src/web/game/` and `src/web/parent/`.
- CSS uses `var(--pp-*)` tokens and `pp-` class names. No raw hex values.
- Errors use the domain classes (`LibraryFault`, `EngineError`, `GradingError`, `LlmError`, `ApiError`). Server errors carry an HTTP status.
- Comments are rare in this codebase. A new one should explain a reason the code can't show.

## Kid and parent experience

- Kid buttons are at least 72px (60px secondary) and text at least 18px. The board stays at or above 512px on a 768 by 1024 tablet.
- Meaning doesn't depend on color alone. Arrows differ by dash, grades show an icon and a word.
- Moves work by tap-tap and by drag. The screen works with the sound off and with read-aloud on.
- Icon buttons have an `aria-label` from `en.json`, and their icons are `aria-hidden`.
- Parent screens stay behind the PIN and keep the plain parent style.

## Tests and checks

- The change adds or updates tests at the right level: colocated unit tests, `tests/integration/` for real Stockfish, `tests/e2e/` for user flows. See the [test patterns](docs/agents/code-patterns.md#tests).
- The author reports `bun run typecheck`, `bun run lint` and `bun run test` results. UI, route and engine changes also report `bun run build && bun run e2e`.
- Packaging, CLI or dependency changes also report `bun run check:native`, `bun run check:licenses` and `bun run check:pack`.
- Tablet layout changes on macOS report the WebKit run: `PAWNPAL_E2E_WEBKIT=1 bun run e2e --project=tablet`.

## Writing the review

List findings in order of severity. Give each one a file and line, what goes wrong, and the input or state that triggers it. Mark it as a blocker, or as a suggestion the author can decline. Leave formatting to Prettier and ESLint. If you ran the checks yourself, say which ones and what happened.
