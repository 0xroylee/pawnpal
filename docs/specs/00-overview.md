# pawnpal: overview

pawnpal is a free, open-source chess coach for kids that runs on the family computer. Stockfish plays the opponent and checks every move. A coach character, Pip the Pawn, explains mistakes in plain words. If a parent connects a local LLM, Pip's wording gets warmer and more varied, but the app works fully without one.

Inspired by [this post](https://www.superlinear.academy/c/share-your-projects/63d613): a parent built a Stockfish + local LLM sparring partner so they didn't have to play every game themselves. Two of their lessons shape this design: LLMs can't be trusted to calculate chess, and the hard part is keeping the kid interested.

## Who it's for

- **Kid player:** about 6–12 years old, knows how the pieces move, rated roughly 0–1200.
- **Parent:** installs and configures it. They can run one terminal command and follow a setup screen, and we assume nothing beyond that.

## Principles

1. **Stockfish is the only source of chess truth.** Every claim the coach makes comes from engine output or a rule check on the board. The LLM never calculates.
2. **Works offline on modest hardware.** No LLM, GPU, account or internet connection is required after install.
3. **Private by default.** There is no telemetry and no accounts. The only outbound call is to an LLM endpoint the parent configures, and it never includes the kid's name.
4. **Kids can't type free text.** Every kid-facing input is a button, a piece move or a picker.
5. **A quiet coach.** Pip speaks up on mistakes, praises now and then, and doesn't nag about small inaccuracies.

## Decisions

| Topic | Decision |
|---|---|
| Audience | Open source; families run it on their own machines |
| Packaging | `npx pawnpal` starts a local Node server and opens the browser |
| Chess engine | Stockfish WebAssembly running in the browser (multi-threaded when possible, single-threaded fallback) |
| LLM | Optional. Template text always works; an LLM only rewords it |
| Pip voice model | Optional fine-tuned Qwen3 1.7B/4B (`pawnpal-pip`) trained on engine-confirmed facts, spec 13. Templates stay the fallback; baseline models are measured first |
| LLM backend | Any OpenAI-compatible API, with Ollama (`http://127.0.0.1:11434/v1`) as the default |
| LLM role | Rewords verified facts only. Output is checked against the facts and falls back to the template on failure or timeout |
| Players | Knows the rules, up to ~1200. Teaching the rules is out of scope |
| Language | English only, with every string in `i18n/en.json` so translations can be added |
| Coach timing | Speaks on mistakes and blunders, short praise on great moves, Hint button always available, post-game review of 3–5 key moments |
| Mistakes | "Try again" with a nudge. The better move is shown after a second miss or when the kid taps "Show me" |
| Difficulty | About 8 named levels. The app suggests moving up or down after a streak and never changes the level on its own |
| Saved data | A profile per kid, stored by the server in SQLite at `~/.pawnpal/` |
| Stack | TypeScript; Vite + React + react-chessboard + chess.js; Hono on Node; built-in `node:sqlite` (no native modules) |
| License | GPL-3.0 for the project (Stockfish is GPL-3.0 and is bundled). Exception: the default horsey piece art ships under its own CC BY-NC-SA 4.0 license (see `design/assets/pieces/horsey/LICENSE.md`) |
| Coach detects | Hanging pieces, missed captures, forks (allowed and missed), allowed mate, missed mate in 1–2, opponent threats |
| Parent area | First-run setup wizard; settings behind a 4-digit PIN |
| Motivation | Pip mascot, 0–3 stars per game, a small set of badges |
| Voice | Coach messages read aloud with browser speech; kid can mute |
| Devices | Localhost by default; opt-in home-network mode with a QR code for tablets |
| Specs | Markdown files in `docs/specs/`, one per vertical slice |
| Name | pawnpal (`npx pawnpal`, `~/.pawnpal/`) |

Defaults chosen without a separate decision: no chess clock; the kid picks White, Black or random; move sounds with a mute; Node 22.13 or newer (first release where `node:sqlite` needs no flag).

## Architecture

```
 Browser (computer or tablet)                     Node server (npx pawnpal)
┌──────────────────────────────────────┐         ┌───────────────────────────────┐
│ React UI: board, coach bubble,       │  JSON   │ Hono API                       │
│           review, profiles           │ ──────► │  ├─ profiles, games (SQLite)   │
│  ├─ game/    state machine (chess.js)│         │  ├─ settings, parent gate      │
│  ├─ coach/   grading, detectors,     │         │  ├─ LLM proxy + validator ──────────► OpenAI-compatible API
│  │           templates (pure TS)     │         │  └─ static files (dist/web)    │      (Ollama by default)
│  └─ engine/  Stockfish WASM workers  │         └───────────────────────────────┘
│              "opponent" + "analyst"  │                ~/.pawnpal/pawnpal.db
└──────────────────────────────────────┘
```

- Chess work (engine, grading, detection, templates) runs in the browser. That keeps the server small and lets a tablet run its own engine.
- The server owns persistence, settings and every LLM call. LLM calls go through the server so API keys never reach the browser and CORS isn't an issue.
- The rephrase validator and the prompt builder live in `src/shared/coach/` so they are unit-tested once and used by the server and by the training pipeline (spec 13).

## Repository layout

```
pawnpal/
├── bin/pawnpal.js          # npx entry: checks Node version, starts server, opens browser
├── src/
│   ├── server/             # Hono app, routes, db + migrations, llm client
│   ├── web/                # Vite + React app
│   │   ├── engine/         # Stockfish worker wrapper (UCI)
│   │   ├── coach/          # grading, detectors, templates — no React imports
│   │   ├── game/           # game state machine
│   │   └── i18n/en.json    # every user-facing string
│   └── shared/             # types + zod schemas used by web and server
├── tests/e2e/              # Playwright
├── tools/calibrate/        # level strength measurement (spec 02)
├── training/               # spec 13 data pipeline and fine-tuning (not in the npm package)
└── docs/specs/
```

It's a single npm package. `npm run build` outputs `dist/server` and `dist/web`.

## Shared types (sketch)

Specs 03 and 04 own the exact shapes.

```ts
type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

interface EngineLine { uci: string; san: string; cp?: number; mate?: number; pv: string[] }

interface MoveAnalysis {
  ply: number;
  fenBefore: string;
  moveUci: string;
  moveSan: string;
  linesBefore: EngineLine[];      // MultiPV 3, kid to move
  linesAfter: EngineLine[];       // MultiPV 2, opponent to move
  winBefore: number;              // 0–100, kid's perspective
  winAfter: number;
  drop: number;
  grade: Grade;
  isOnlyMove: boolean;            // "great" flag
  facts: CoachFact[];             // spec 04
  attempts?: AttemptRecord[];     // spec 05
  hintTier?: 0 | 1 | 2 | 3;       // spec 04
}

interface CoachFact {
  schemaVersion: number;         // spec 13: the model tag names the schema it was trained on
  kind: 'allowed-mate' | 'missed-mate' | 'hanging-piece' | 'allowed-fork'
      | 'missed-capture' | 'missed-fork' | 'threat' | 'played-fork';
  pieces: PieceRef[];             // { type, color, square }
  moves: string[];                // SAN, every move the coach may mention
  squares: string[];              // every square the coach may mention
  betterMoveSan?: string;
  mateIn?: number;
}
```

## Glossary

- **Win chance:** 0–100 estimate that the kid wins, computed from the engine eval with the Lichess formula (spec 03).
- **Drop:** win chance before the kid's move minus win chance after, from the kid's side.
- **Grade:** best, good, inaccuracy, mistake or blunder.
- **Fact:** a structured, engine-confirmed statement about a move, such as "the knight on f3 was left undefended and the engine line wins it." Produced by a detector.
- **Template:** a sentence in the language file that turns a fact into text.
- **Nudge:** text that points at the problem without naming the better move.
- **Reveal:** text and an arrow that name the better move.
- **Level:** one of 8 named opponent strengths.
- **Parent gate:** the PIN check in front of settings.
- **Network mode:** opt-in home-network access for tablets.

## Out of scope for v1

- Teaching the rules (how pieces move, castling, en passant).
- Online play, accounts, cloud hosting, sync between computers.
- Puzzle mode, including puzzles made from the kid's own mistakes.
- Pins, skewers, discovered attacks, back-rank threats, opening principles.
- Chess clocks and time controls.
- Languages other than English.
- Downloading LLM models from inside the app (the wizard shows the command instead).
- Free-form questions to the coach.
- Native mobile or desktop apps.
- Analysis of the opponent's moves; eval graphs.

## Build order

```
01 ──┬── 02
     ├── 03 ── 04 ──┬── 05
     │              ├── 08 ──┬── 13
     │              │        ├── 09
     ├── 06 ────────┼── 07   │
     │              └── 10   │
     └── 11 ─────────────────┘
all ── 12
```

Suggested sequence: **01 → 03 → 04 → 08 (client, prompt builder, validator) → 13 → 05 → 06 → 02 → 07 → 09 → 10 → 11 → 12.** The coach loop (03–05) is the riskiest part, so it gets played early. Spec 13 follows 03, 04 and 08. It uses facts from that pipeline and the exact inference prompt and validator. The parts of 08 that need the settings table land after 06. Until 02 lands, the opponent uses the placeholder strength from 01.

## Quality bar

- Test-driven with Vitest. `coach/` has a position-fixture suite of FEN + kid move + fixed-depth engine output → expected grade and facts. Single-threaded Stockfish at fixed depth is deterministic, so fixtures can use the real engine.
- Playwright end-to-end tests for the flows listed in each spec. A dev-only `?fen=` parameter (enabled by `PAWNPAL_DEV=1`) starts a game from any position.
- Every user-facing string lives in `i18n/en.json`, enforced by a test.
- CI runs typecheck, lint, unit and end-to-end tests. Spec 12 widens CI to macOS, Windows and Linux.

## Spec format

Each spec has: Goal, Scope, Out of scope, Design, Acceptance criteria, Test plan, Open questions.
