# Pawnpal design

How the system fits together and the rules for what kids and parents see. The [overview spec](docs/specs/00-overview.md) records the product decisions. The [design kit](design/README.md) holds the visual system and the research behind it. This file is the short version an agent needs before changing either.

## Where code runs

Chess work happens in the browser. The server owns storage, settings and every LLM call.

```
Browser (computer or tablet)                  Node server (npx pawnpal)
  React screens                       JSON      Hono under /api
  game/    reducer over chess.js   ---------->  db/      profiles, games (node:sqlite)
  coach/   grading, detectors,                  parent/  PIN gate, settings, network
           templates (pure TS)                  llm/     client, rephrase, circuit breaker ---> OpenAI-compatible API
  engine/  Stockfish WASM workers                        static files from dist/web
           "opponent" and "analyst"            ~/.pawnpal/pawnpal.db
```

A tablet runs its own engine, so the server stays small and never analyses positions. API keys stay on the server, and the browser never calls the LLM directly.

Code in `src/shared/` runs on both sides. It holds the game record, review moments, rewards, the `CoachFact` types, the prompt builder and the rephrase validator. The training pipeline in `training/` imports the same prompt builder and validator, so a fine-tuned model is judged by the rules the app uses at runtime.

## The coach pipeline

A kid move turns into Pip's words in these steps. Each one is a separate module with its own tests.

1. `useGrading` asks the analyst engine for MultiPV lines before and after the move. `createAnalysisPipeline` starts the "before" search while the kid is still thinking.
2. `grade.ts` turns centipawns or mate scores into win chance with `winChance.ts`, takes the drop from the kid's side, and assigns a `Grade` using `gradeConfig.ts`.
3. The detectors in `coach/detectors/` read the boards and engine lines and return `CoachFact` objects. `see.ts`, `material.ts` and `boardQueries.ts` do the board math. A detector that can't prove its claim from the lines returns nothing.
4. `priority.ts` picks one fact per message. The `MoveAnalysis` keeps every fact for the post-game review.
5. `templates.ts` renders the fact with a message key from `en.json`, picks among 2 or 3 variants, and avoids repeating the last one. `annotations.ts` turns the same fact into arrows and rings for `BoardOverlay`.
6. If the parent enabled a model, `useRephrasedMessage` posts the fact and template text to `/api/coach/rephrase`. `CoachBrain` builds the prompt, calls the model, and runs `validateRephrase`. The validator rejects replies that mention a square or move outside the fact, give away the better move during a nudge or hint, run past two sentences, or contain URLs or emoji. On a rejected reply, an error, a timeout, or after three failures in a row, the server returns the template text.

The template text is always ready before any LLM call starts. The kid never waits on a model to see what went wrong.

## Game state

`src/web/game/reducer.ts` owns the game. It wraps chess.js and moves through the `GamePhase` values in `src/shared/game/types.ts`: `setup`, `kidToMove`, `grading`, `nudge`, `reveal`, `opponentToMove` and `over`. Components dispatch actions and never mutate state.

Engine and server replies arrive late and out of order. Every async action carries the `turnToken` or `gameToken` that was current when it started. The reducer ignores a reply whose token no longer matches. A new async action must follow the same rule, or a slow analysis from an old game will land on the new one.

Hooks connect the reducer to the outside: `useOpponent` asks the opponent engine for a move, `useGrading` runs analysis, `useCoach` drives `coachReducer`, and `autosave.ts` writes the game to the server. Components don't talk to the engine.

## Engine

`EngineClient` is a promise API over UCI with one command in flight. A new request stops the current one first. Transports sit behind the `EngineTransport` interface: `WorkerTransport` in the browser, `NodeStockfishTransport` for integration tests and calibration, `FakeTransport` and `replayTransport` for unit tests.

The server sends COOP and COEP headers so the browser can run multi-threaded WASM. When `crossOriginIsolated` is false, `chooseBuild` falls back to the single-threaded lite build. Both paths have to keep working.

The eight levels live in `engine/levels.ts`. Below Stockfish's 1320 floor, `chooseLimitedMove` picks among engine lines to make human-looking mistakes. `tools/calibrate/` proves each level beats the one below it. Any change to level settings needs a new calibration run.

## Storage and settings

The server stores everything in SQLite through the built-in `node:sqlite`, so the package has no native modules. `Library` in `db/library.ts` holds the SQL. Schema changes are numbered files in `db/migrations/`, applied in order at startup. Request and response shapes are zod schemas in `db/schemas.ts`. Errors that should reach the client are `LibraryFault` with an HTTP status.

`ParentGate` puts parent routes behind the PIN. The server listens on `127.0.0.1` by default. Network mode is opt-in, and `requestAllowed` limits it to private addresses.

## Kid-facing design rules

The design kit has the full set and the research behind each one. These are the rules a change most often breaks.

- Colors come from `design/tokens.css` through `var(--pp-*)`. `src/web/styles/app.css` has no raw hex values, and new CSS shouldn't add any. Run `node design/scripts/check-contrast.mjs` after any color change.
- An edge means press. Buttons and tiles sit on a solid 4px edge and sink into it when tapped. Cards and panels get a 2px line and no edge. Kid screens have no blur shadows.
- Blue means "do this": the main button and the better-move arrow. Coral and orange mean "careful": the danger ring and the threat arrow.
- "Pick one" choices (color, level, profile, avatar) are `pp-tile`s, not dropdowns.
- Shape carries meaning before color does. The better-move arrow is solid, the threat arrow is dashed, and both get a white halo. Every grade shows an icon and a word.
- Kid buttons are 72px tall (60px secondary). Text is at least 18px, coach text 24px. The board targets 600px and never goes below 512px.
- `tokens.css` defines an older band for ages 9 and up (`.pp-app[data-band='older']`): one step smaller, coordinates on, read-aloud off by default. The app doesn't set it yet, and the kit lists keeping it as an open decision. Ask before wiring it up.
- Every move works by tap-tap and by drag. Every screen works with the sound off.
- Feedback offers a way forward: try again, see the answer, or read why. Praise names what the kid did, never how smart they are. [Pip's voice](docs/pip-voice.md) has the wording rules.
- Rewards come at the end of a game: 0 to 3 stars and a few badges. No spin wheels, streak pressure, or other variable rewards.
- The parent area looks different on purpose: system font, grey, dense. Kids shouldn't mistake it for their screens.

## Deliberate choices that look odd

- Pawnpal draws its own arrow overlay because react-chessboard has no dashed arrows and no per-arrow width.
- Horsey is the default piece set even though its license differs from the rest of the project. Commercial builds switch to the Pawnpal or cburnett set. The README explains how.
- The opponent waits 400 to 900 ms before moving so its replies don't feel instant.
- The app suggests a level change after a streak and never changes the level on its own.
