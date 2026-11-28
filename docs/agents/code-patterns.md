# Code patterns

The house style, taken from the code as it stands. When this file and the code disagree, match the code next to your change and mention the mismatch. [AGENTS.md](../../AGENTS.md) has the rules that matter more than style.

## Tooling

- TypeScript in strict mode, targeting ES2022. `tsconfig.web.json` covers `src/web` and `src/shared`. `tsconfig.server.json` covers `src/server` and `src/shared` and emits to `dist/`.
- Prettier formats everything: double quotes, semicolons, trailing commas. Run `bun run lint` instead of formatting by hand.
- ESLint uses typescript-eslint and the React Hooks rules in `src/web`. Fix the lint warning. Don't disable the rule.
- Node scripts in `scripts/`, `tools/` and `bin/` are plain `.mjs` or `.js` with no build step. `bin/pawnpal.js` uses syntax old Node versions can parse, so its version check can run.

## Modules and imports

- Use named exports. The only `export default` is the Stockfish type shim.
- Relative imports include the file extension. Code in `src/web` uses `.js`. Code in `src/server` uses `.ts`, which the server build rewrites. `src/shared` has both, so follow the file you're editing.
- Mark type-only imports with `import type` or an inline `type`. The server config sets `verbatimModuleSyntax` and fails the build without it.
- Dependencies point one way. `src/web` and `src/server` import from `src/shared`. `src/shared` imports from neither, and `src/web` and `src/server` never import each other.
- `src/web/coach/` has no React and depends on engine types only, through narrow picks like `AnalystLike = Pick<EngineClient, "analyze" | "stop" | "newGame">`.

## Types

- Use `type` aliases. The codebase has about 150 and one `interface`.
- Use string literal unions such as `Grade`, `FactKind` and `GamePhase`. There are no enums.
- There is no `any`. Take `unknown` and narrow it, or write a type guard like `isDifficulty(value): value is Difficulty`.
- Actions and events are discriminated unions on `type`, as in `GameAction` and `CoachEvent`.
- Lookup tables use `as const satisfies Record<Key, MessageKey>`, so a missing entry fails typecheck.
- Shared shapes live in `src/shared/**/types.ts`. Zod schemas for HTTP bodies live in `src/server/db/schemas.ts`.

## Functions and state

- Write chess logic as pure functions over FEN strings or chess.js `Chess` instances. Detectors take a `DetectorContext` and return `CoachFact[]`, or `[]` when they can't prove the claim.
- Inject anything nondeterministic: `rng?: () => number`, `now?: () => number`, `fetch`, or an engine transport. Tests pass fakes, and fixtures stay deterministic.
- Reducers own transitions. `gameReducer` and `coachReducer` switch on `action.type`, return new objects, and return the old `state` for input they reject, such as an invalid FEN.
- Async replies carry the `turnToken` or `gameToken` from when they started, and the reducer drops stale ones.
- Stateful helpers are factory functions that return closures: `createAnalysisPipeline`, `createEngines`, `createGameSaver`, `createSounds`, `createVariantPicker`.
- Classes appear where there is a lifecycle or a contract: `EngineClient`, the `EngineTransport` implementations, `CoachBrain`, `ParentGate`, `Library`, and errors. They keep state in `#private` fields.
- Each area has its own error class extending `Error`: `GradingError`, `EngineError`, `LlmError`, `ApiError`, `LibraryFault`. The server throws `new LibraryFault(status, message)` and `api.onError` turns it into a response.
- Leave out an optional field instead of setting it to `undefined`. The reducer spreads it in conditionally: `...(level === undefined ? {} : { level })`.

## React

- Function components with named exports, props typed inline in the signature.
- Components render state and dispatch actions. Hooks in `src/web/game/` (`useOpponent`, `useGrading`, `useCoach`, `useRephrasedMessage`) talk to the engine and the server.
- Every visible string and every `aria-label` comes from `t(key, params)`.
- Buttons set `type="button"`. Icons come from `lucide-react` with `aria-hidden="true"`, and the button gets the label.
- Class names start with `pp-` and use `pp-block__element` and `pp-block--modifier`. Reuse a class from `design/components.css` before you add CSS to `src/web/styles/app.css`.
- CSS reads colors, sizes and motion from `var(--pp-*)` tokens. `app.css` has no raw hex values.

## Server

- `createApp` in `src/server/app.ts` builds the Hono app and mounts the API under `/api`. Routes are grouped by area in `db/routes.ts` and `parent/routes.ts`.
- Read bodies with `jsonBody(context, schema)`. It rejects a non-JSON content type or a body that fails the schema with a 400.
- Parent routes check `ParentGate` before doing anything.
- SQL lives in `Library` (`db/library.ts`) and in numbered migrations under `db/migrations/`. Use `transaction()` from `db/migrate.ts` for multi-statement writes. Storage is `node:sqlite` only.
- Route modules take their dependencies (`fetch`, `now`, `network`) as an optional argument, so tests can call `app.request()` without a real network. LLM tests use the in-process server in `llm/mockOpenAi.ts`.

## Strings and wording

- Message keys are dotted and grouped by screen or area: `setup.level.1.name`, `game.giveUp`, `grade.oops`. Placeholders look like `{level}`.
- Coach templates have 2 or 3 numbered variants. They name pieces instead of squares and follow [Pip's voice](../pip-voice.md).
- English is the only locale. Keep keys and placeholders stable so translations can follow. CONTRIBUTING.md explains how to add one.

## Tests

[Testing](../../AGENTS.md#testing) comes first: new behavior gets an e2e spec, not a unit test.

- E2E specs live in `tests/e2e/` and run the production build against the real server. They locate elements by role and accessible name, use helpers from `tests/e2e/helpers.ts` such as `startAs` and `openDevFen`, and start mid-game through the dev-only `?fen=` parameter (`PAWNPAL_DEV=1`).
- Seed profiles and saved games through the HTTP API, as `saved-game.spec.ts` does. Build game states with `gameReducer` instead of writing state JSON by hand.
- Check layout with element boxes measured in the browser at 1280x800 and 768x1024.
- Coach fixtures in `tests/fixtures/coach/*.json` record a FEN, the kid move and fixed-depth Stockfish lines. Each detector has at least one fixture where it stays quiet. Specs replay them through the replay analyst.
- Name specs after the behavior: `test("praises the only move")`.
- The existing Vitest suites stay: colocated `name.test.ts` and `name.test.tsx` files, `tests/unit/` (the i18n scan and coach wording) and `tests/integration/` (real Stockfish WASM in Node). Keep them passing. Don't add to them.

## Comments

There are about 15 comment lines across 11,000 lines of source. Names and types carry the meaning. Write a comment only for a reason the code can't show, like a Stockfish quirk or a browser limit, and link the source when there is one.
