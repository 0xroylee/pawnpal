# Workflow

The steps behind the short loop in [AGENTS.md](../../AGENTS.md#workflow), plus recipes for the changes that come up most. [CONTRIBUTING.md](../../CONTRIBUTING.md) has the full CI command list.

## Specs come first

Behavior is defined in `docs/specs/`, one file per vertical slice. Each spec has the same sections: Goal, Scope, Out of scope, Design, Acceptance criteria, Test plan, Open questions. The [overview](../specs/00-overview.md) has the build order and the decisions every spec inherits.

- If a change fits an existing spec, implement it to that spec's acceptance criteria.
- If it changes what a spec says, update the spec in the same change.
- If no spec covers it, write a short proposal in the spec format and ask before you build it.
- An open question in a spec is the user's call. Ask instead of picking an answer in code.

## Run the app

```sh
bun install --frozen-lockfile
bun run dev
```

`bun run dev` copies the engine files, starts Vite on port 5173, and runs the server on port 4747 with `PAWNPAL_DEV=1`. Stop anything else on 4747 first. With the dev flag on, `?fen=<FEN>&color=w` or `color=b` starts a game from any position. Use it to reach a coach message without playing up to it.

## Which checks to run

| You changed                        | Run                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| Anything                           | `bun run typecheck`, `bun run lint`, `bun run test`                                   |
| UI, routes, engine, or CSS         | add `bun run build` and `bun run e2e`                                                 |
| Tablet layout (macOS)              | add `bun run playwright install webkit` and `PAWNPAL_E2E_WEBKIT=1 bun run e2e --project=tablet` |
| Dependencies, build, CLI, package  | add `bun run check:native`, `bun run check:licenses`, `bun run check:pack`, `npm run smoke:package` |
| Level settings                     | add `node tools/calibrate/run.mjs` (1,600 games, so ask before starting it)            |
| Design tokens                      | add `node design/scripts/build-tokens-json.mjs` and `node design/scripts/check-contrast.mjs` |

Report each command you ran and its result. If you skipped one, say which and why.

## Recipes

### Add a coach detector

Adding a fact kind changes the `CoachFact` contract, so ask first.

1. Record fixtures in `tests/fixtures/coach/detectors.json`: the position, the kid move, and fixed-depth Stockfish lines. Include a position where the detector must stay quiet.
2. Add the kind to `FactKind` in `src/shared/coach/types.ts`. Decide with the user whether `COACH_FACT_SCHEMA_VERSION` changes.
3. Write the detector in `src/web/coach/detectors/<name>.ts`. It takes a `DetectorContext` and returns `CoachFact[]` built with `finalizeFact`. Return `[]` whenever the engine lines don't prove the claim.
4. Register it in `allDetectors` in `detectors/index.ts` and place it in `FACT_PRIORITY` in `priority.ts`.
5. Add 2 or 3 numbered variants for each mode to `src/web/i18n/en.json`: `coach.<kind>.explain.1`, plus `nudge`, `reveal`, `praise` and `late`, and `hint.tier2.<kind>.1`. `messageKeys` in `templates.ts` finds them by prefix. Add board marks in `annotations.ts` if the kind needs its own arrows or rings.
6. Check that `validateRephrase` and the prompt builder accept the new kind's squares and moves.
7. Run the fixture suite, `tests/unit/coach-wording.test.ts`, and then the browser through `?fen=`.

### Add or change a string

1. Add the key to `src/web/i18n/en.json` next to its siblings, using the dotted naming of that screen.
2. Read it with `t("key", params)` in components or the template helpers in the coach.
3. Run `bun run test`. The i18n scan fails if text bypasses `en.json` or a key is missing.

For Pip's lines, follow [Pip's voice](../pip-voice.md) and keep the facts identical across variants.

### Add an API route

1. Add the request and response zod schemas to `src/server/db/schemas.ts`.
2. Add the route to `db/routes.ts` or `parent/routes.ts`. Read the body with `jsonBody(context, schema)` and throw `LibraryFault` for client errors. Parent routes check `ParentGate` first.
3. Put SQL in a `Library` method, not in the route.
4. Test it with `app.request()` in the matching server test file. Pass `fetch` or `now` through the dependencies argument instead of mocking globals.
5. Call it from the web through `src/web/game/libraryClient.ts` or `src/web/parent/client.ts`.

### Change the database

Ask first. Saved data on families' machines has to survive the upgrade.

1. Add the next numbered file in `src/server/db/migrations/`. Never edit a migration that has shipped.
2. Update `Library`, the zod schemas, and the shared types in `src/shared/game/`.
3. Add a test in `src/server/library.test.ts` that opens a database at the old schema and migrates it.

### Change a dependency

Ask first.

1. Run `bun add` or `bun remove` so `bun.lock` changes with `package.json`.
2. For shipping dependencies, run `node scripts/check-licenses.mjs --write` and review the `THIRD_PARTY_NOTICES` diff.
3. Run `bun run check:native` and `bun run check:licenses`. Pawnpal can't ship native modules.

### Change difficulty levels

Ask first. Change `src/web/engine/levels.ts`, run a pilot with `node tools/calibrate/run.mjs --openings 5 --repeats 1`, and then the full run before release. The report goes to `tools/calibrate/results/`.

### Change design tokens or assets

Edit `design/tokens.css` and regenerate `tokens.json`. Pip and the Pawnpal piece set come from `design/scripts/build-pip.mjs` and `build-pieces.mjs`, so edit those scripts instead of the SVG files. Run the contrast check after any color change.

## Commits

Commit, push or tag only when asked. Messages follow the history: `Spec 04: Pip explains mistakes with engine-confirmed facts` for spec work, a plain imperative sentence otherwise, like `Make release checks portable across runners`. Keep one spec slice per commit when you can.
