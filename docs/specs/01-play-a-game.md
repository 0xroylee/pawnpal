# 01: Basic version: play a full game

**Depends on:** none

## Goal

A parent runs `npx pawnpal`, the browser opens, and a kid plays a complete legal game against Stockfish. Every later spec builds on this one.

## Scope

**Project scaffold**
- Single npm package, TypeScript strict mode, Vite + React, Hono server, Vitest, Playwright, ESLint, Prettier.
- `LICENSE` (GPL-3.0) from the first commit.
- Scripts: `npm run dev` (Vite + server with proxy), `npm run build`, `npm test`, `npm run e2e`.

**CLI (`bin/pawnpal.js`)**
- Written in syntax that old Node versions can parse, so the version check can run. Exits with code 1 and names the required version if Node is older than 22.13.
- Starts the server on `127.0.0.1:4747`. If that port is busy, it tries the next 10 ports. `--port <n>` overrides; `--port 0` picks any free port.
- Opens the default browser (`open` package) unless `--no-open` is given.
- Prints the URL and "Press Ctrl+C to stop". Exits cleanly on SIGINT/SIGTERM.

**Server**
- Serves `dist/web` as static files. `GET /api/health` returns `{ ok: true, version }`.
- Sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on every response, so the browser allows multi-threaded WebAssembly.

**Engine wrapper (`src/web/engine/`)**
- Loads Stockfish WASM from the `stockfish` npm package. Uses the multi-threaded build when `crossOriginIsolated` is true, otherwise the single-threaded lite build.
- `EngineClient` is a promise API over UCI:
  - `init()`, `newGame()`, `setOptions(opts)`
  - `analyze(fen, { depth?, movetimeMs?, multiPv? }) → EngineLine[]`
  - `bestMove(fen, opts) → uci`
  - `stop()`
- One command in flight per instance. A new request stops the current one first.
- Two instances: `opponent` (used here) and `analyst` (used from spec 03).

**Game screen**
- Setup: White / Black / Surprise me.
- Board (react-chessboard): drag and tap-to-move, legal-move dots on selection, last-move and check highlights.
- Promotion picker (queen, rook, bishop, knight).
- Opponent at a placeholder strength (`Skill Level 3`, depth 8) with a 400–900 ms "thinking" delay so its moves don't appear instantly. Spec 02 replaces this.
- Move list in SAN.
- End detection via chess.js: checkmate, stalemate, threefold repetition, fifty-move rule, insufficient material. A result banner with "Play again".
- Resign button with a confirmation step.

**Sound**
- Move, capture, check and game-end sounds (CC0 assets) with a mute toggle. The setting lives in localStorage until spec 06 moves it into the profile.

**Text**
- Every string comes from `src/web/i18n/en.json` through a small `t(key, params)` helper.

**CI**
- GitHub Actions on Ubuntu with Node 22: typecheck, lint, unit, end-to-end (Chromium).

**Dev hook**
- With `PAWNPAL_DEV=1`, the URL parameter `?fen=<FEN>&color=w|b` starts a game from that position. Later specs' end-to-end tests rely on it.

## Out of scope

Profiles, saved games, difficulty levels, coaching, LLM, network mode.

## Design

- Game state lives in a reducer in `src/web/game/` that wraps chess.js. Specs 03 and 05 add states (grading, nudge, retry) without touching the board component.
- The UI never talks to the engine directly. The reducer enters an `opponentToMove` state, and an effect calls `opponent.bestMove(fen)` and dispatches the result.
- The UCI parser handles `info depth … multipv … score cp|mate … pv …` and `bestmove`, and ignores unknown lines.

## Acceptance criteria

1. From a clean checkout, `npm ci && npm run build && node bin/pawnpal.js` opens the browser to the home screen.
2. `node bin/pawnpal.js --no-open --port 0` prints a URL, and `GET /api/health` on it returns 200 with `{ ok: true }`.
3. Under Node 20, the CLI exits with code 1 and a message naming Node 22.13.
4. When port 4747 is taken, the server starts on 4748 and prints that URL.
5. The kid can play as White or Black. Surprise me picks either one.
6. An illegal move snaps back. Selecting a piece shows its legal destinations.
7. The opponent replies within 2.5 s, including the thinking delay, on a 2020-era laptop.
8. Promotion shows the picker, and choosing a knight promotes to a knight.
9. Each end condition shows the correct result text.
10. Resign ends the game as a loss after confirmation.
11. `crossOriginIsolated` is true on localhost. With the COOP/COEP headers turned off, the engine falls back to the lite build and still plays.
12. No user-visible string exists outside `en.json` (checked by a test).

## Test plan

- **Unit:** game reducer (moves, each end condition from FEN fixtures, promotion); UCI parsing in `EngineClient` against a fake worker; CLI argument parsing and port fallback.
- **Integration:** `EngineClient` against real Stockfish WASM in Node returns a legal `bestmove` for 20 fixed positions.
- **End-to-end (Playwright):** launch the built server; play 5 moves and confirm the opponent replies each time; resign flow; promotion from a `?fen=` position.

## Open questions

- Which `stockfish` package version and which build files to ship. Target: under 15 MB packed.
