# Pawnpal agent guide

Read this before you change anything in the repository. It says who Pawnpal is for, which rules don't bend, and how a change gets made. Details live in the linked files so this one stays short.

| File                                                         | Read it when                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| [DESIGN.md](DESIGN.md)                                       | You touch architecture, data flow, or anything a kid or parent sees |
| [REVIEW.md](REVIEW.md)                                       | You review a change, including your own before you hand it back     |
| [docs/agents/code-patterns.md](docs/agents/code-patterns.md) | You write or edit code                                              |
| [docs/agents/feature-map.md](docs/agents/feature-map.md)     | You need the spec, code and tests behind a user feature             |
| [docs/agents/workflow.md](docs/agents/workflow.md)           | You need the steps for a common change                              |
| [docs/specs/00-overview.md](docs/specs/00-overview.md)       | You need product decisions, the glossary, or what is out of scope   |
| [CONTRIBUTING.md](CONTRIBUTING.md)                           | You need the full list of CI checks                                 |

## Scope and audience

Pawnpal is an offline chess coach for kids. `npx pawnpal` starts a local Node server and opens the browser. Stockfish plays the opponent and grades every kid move. Pip the Pawn explains mistakes using facts the engine confirmed. A local LLM can reword Pip's lines if a parent connects one.

The app has two audiences, and they get different screens.

- Kids, about 6 to 12 years old, who know how the pieces move and play at up to about 1200. They never type. Everything they touch is a button, a piece move or a picker.
- Parents, who run one terminal command and follow a setup screen. Their settings sit behind a 4-digit PIN.

This guide is for coding agents and the people who review their work, and it covers the whole repository. For the slice it describes, a spec in `docs/specs/` overrides this guide. If the two disagree, follow the spec and point out the conflict in your summary.

Version 1 leaves out teaching the rules, online play, accounts, puzzles, pins and skewers, clocks, languages other than English, free-form questions to the coach, and native apps. The overview spec has the full list. Don't build toward any of them without asking.

## Principles

These come from the overview spec. A change that breaks one is wrong even when the tests pass.

1. Stockfish is the only source of chess truth. Every coach claim traces back to engine output or a chess.js rule check. The LLM rewords facts. It never calculates.
2. It works offline on modest hardware. After install it needs no GPU, LLM, account or internet connection.
3. Data stays private. There is no telemetry and no account. The one outbound call goes to the LLM endpoint the parent configured, and it never carries the kid's name, games or database.
4. Kids can't type free text.
5. Pip is a quiet coach. Pip speaks on mistakes and blunders, praises a great move now and then, and stays silent about small inaccuracies.
6. The built-in templates always work. The LLM can fail, time out or be switched off, and the kid still sees the same facts.

## Pip's spoken voice

Use American English Bella (`af_bella`) from `hexgrad/Kokoro-82M` v1.0 at revision `f3ff3571791e39611d31c381e3a41a3af07b4987` for Pip's offline coaching and reward audio. Generate every clip with `speed=0.95` and keep the voice's original pitch. Keep this voice, model revision, and delivery fixed across releases, platforms, and regenerated assets. If a clip is unavailable, show its text in silence. [Approved voice audition](https://github.com/0xroylee/pawnpal/blob/eba46983797bd0a9a8f8cebc0581943a2fc47c2b/docs/pip-voice.md#bella-voice-audition)

## Boundaries

### Always

- Put every user-facing string in `src/web/i18n/en.json` and read it through `t()` or the coach template helpers. `tests/unit/i18n-scan.test.ts` fails on stray text.
- Ship a test with the change. Coach logic gets a position fixture.
- Validate every server request body with a zod schema through `jsonBody()`.
- Keep `src/web/coach/` and `src/shared/` free of React.
- Run `bun run typecheck`, `bun run lint` and `bun run test` before you report a change as done, and include the results.

### Ask first

- Adding, removing or upgrading a dependency. Shipping dependencies update `THIRD_PARTY_NOTICES` and must not use native modules (`bun run check:native`).
- Adding a migration or changing a table in `src/server/db/`.
- Changing the `CoachFact` shape or `COACH_FACT_SCHEMA_VERSION`. Trained models record the schema version they learned.
- Changing grade thresholds, detector rules, level tables, or anything else that moves calibration results.
- Changing what the server sends to the LLM endpoint.
- Editing CI workflows, the release checklist, CLI flags, or the `files` list in `package.json`.
- Committing, pushing, tagging or publishing.

### Never

- Let the LLM, or any code other than Stockfish and chess.js, decide a grade, fact, move or square.
- Add telemetry, analytics, remote fonts, CDNs, or any other network call.
- Add a text field to a kid screen.
- Edit anything under `design/assets/pieces/horsey/`. Those files ship byte-for-byte under CC BY-NC-SA 4.0.
- Hand-edit generated files: `design/tokens.json`, `design/assets/pip/`, `design/assets/pieces/pawnpal/`, `public/engine/`, `dist/`, `bun.lock`. Run the script that writes them.
- Install with npm. The repo uses Bun 1.4.4 and `bun.lock`. npm only runs the package smoke test.
- Loosen a test, fixture or validator so a change passes.

## Workflow

1. Find the feature in the [feature map](docs/agents/feature-map.md) and read its spec. The acceptance criteria and test plan define done.
2. Read the code and tests near the change, and match them. The [code patterns](docs/agents/code-patterns.md) list the house style.
3. Write a failing test. For coach work, start from a fixture in `tests/fixtures/coach/`.
4. Make the smallest change that passes it. Keep chess logic pure, and inject time, randomness, `fetch` and the engine.
5. Run the core checks. Add `bun run build && bun run e2e` when the change touches UI, routes or the engine.
6. Check your diff against [REVIEW.md](REVIEW.md).
7. Report what changed, which checks ran and their results, and anything you skipped or left open.

[workflow.md](docs/agents/workflow.md) has recipes for detectors, strings, routes, migrations and dependencies.
