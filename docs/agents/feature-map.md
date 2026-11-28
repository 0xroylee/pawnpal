# User feature map

Each feature a kid or parent can see, with the spec that defines it and the code and tests behind it. Start here to find where a change belongs. Paths are relative to the repository root. Tests named `*.test.ts` sit next to the code they cover, so the lists below name only the suites that live elsewhere.

| Feature                                                           | Who    | Spec                                                   |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| [Start the app and play a game](#start-the-app-and-play-a-game)   | Both   | [01](../specs/01-play-a-game.md)                       |
| [Pick an opponent level](#pick-an-opponent-level)                 | Kid    | [02](../specs/02-difficulty-levels.md)                 |
| [Move grading](#move-grading)                                     | Kid    | [03](../specs/03-move-grading.md)                      |
| [Pip explains mistakes and gives hints](#pip-explains-mistakes-and-gives-hints) | Kid | [04](../specs/04-coach-facts-templates-hints.md) |
| [Try again and Show me](#try-again-and-show-me)                   | Kid    | [05](../specs/05-try-again.md)                         |
| [Profiles and saved games](#profiles-and-saved-games)             | Both   | [06](../specs/06-profiles-and-saved-data.md)           |
| [Post-game review](#post-game-review)                             | Kid    | [07](../specs/07-post-game-review.md)                  |
| [Coach rephrasing with a local model](#coach-rephrasing-with-a-local-model) | Parent | [08](../specs/08-llm-rephrasing.md)          |
| [Setup wizard and Parent settings](#setup-wizard-and-parent-settings) | Parent | [09](../specs/09-setup-wizard-and-parent-area.md)  |
| [Pip, stars, badges and read-aloud](#pip-stars-badges-and-read-aloud) | Kid | [10](../specs/10-pip-rewards-voice.md)               |
| [Play on a tablet](#play-on-a-tablet)                             | Both   | [11](../specs/11-tablet-mode.md)                       |
| [Install from npm](#install-from-npm)                             | Parent | [12](../specs/12-release.md)                           |
| [Pip voice model training](#pip-voice-model-training)             | Maintainers | [13](../specs/13-train-coach-model.md)            |

## Start the app and play a game

The parent runs `npx pawnpal` and the browser opens. The kid picks a color and plays a full legal game with move sounds, a move list, promotion, resign and a celebration screen.

- CLI: `bin/pawnpal.js` (Node version check), `src/server/cli.ts` (flags `--port`, `--no-open`, `--lan`, and the `reset-pin` command), `src/server/main.ts`
- Server: `src/server/app.ts` (static files, COOP and COEP headers, `/api/health`)
- Game: `src/web/game/reducer.ts`, `src/web/game/rules.ts`, `src/web/game/useOpponent.ts`
- Board: `src/web/board/` (`Board`, `PromotionPicker`, `selection.ts`, `pieces.tsx`)
- Engine: `src/web/engine/` (`EngineClient`, `uci.ts`, `chooseBuild.ts`, `engines.ts`, transports)
- Screens: `src/web/screens/SetupScreen.tsx`, `GameScreen.tsx`, `MoveList.tsx`, `ResultScreen.tsx`, `resultMessage.ts`
- Sound: `src/web/sound/sounds.ts`
- Dev hook: `src/web/dev/startParams.ts` (`?fen=` and `?color=` with `PAWNPAL_DEV=1`)
- Tests: `tests/e2e/play.spec.ts`, `black.spec.ts`, `checkmate.spec.ts`, `illegal-move.spec.ts`, `promotion.spec.ts`, `resign.spec.ts`, `health.spec.ts`, `coi-fallback.spec.ts`, `tests/integration/engine-node.test.ts`, `tests/fixtures/site/`

## Pick an opponent level

Eight named levels, Sleepy Snail to Dragon. The app suggests a change after a streak and never changes the level on its own.

- Levels: `src/web/engine/levels.ts` (`configureOpponent`, `chooseLimitedMove`), `src/shared/game/difficulty.ts`
- Names and descriptions: `setup.level.*` keys in `src/web/i18n/en.json`
- Picker and suggestion: `src/web/screens/SetupScreen.tsx`, `src/web/screens/ProfileScreens.tsx`, `/api/profiles/:id/suggestion` in `src/server/db/routes.ts`
- Calibration: `tools/calibrate/` and its reports in `tools/calibrate/results/`, `.github/workflows/calibrate.yml`
- Tests: `tests/e2e/setup.spec.ts`, `level-progress.spec.ts`, `resign.spec.ts`

## Move grading

Every kid move gets a grade within about a second: best, good, inaccuracy, mistake or blunder. The kid sees great, good, oops and big oops.

- Grading: `src/web/coach/grade.ts`, `gradeConfig.ts`, `winChance.ts`, `analysisPipeline.ts`
- Hook: `src/web/game/useGrading.ts`
- Debug panel: `src/web/dev/DebugPanel.tsx`, `src/web/dev/replayAnalyst.ts`
- Tests: `tests/fixtures/coach/grading.json`, `src/web/coach/grading.fixtures.test.ts`, `tests/e2e/grading-debug.spec.ts`

## Pip explains mistakes and gives hints

After a mistake or blunder Pip says what went wrong in one or two sentences and marks the board. The Hint button has three tiers.

- Facts: `src/web/coach/detectors/` (one file per fact kind, registry in `index.ts`, ordering in `priority.ts`)
- Board math: `src/web/coach/see.ts`, `material.ts`, `boardQueries.ts`
- Wording: `src/web/coach/templates.ts`, coach keys in `en.json`, [Pip's voice](../pip-voice.md)
- Board marks: `src/web/coach/annotations.ts`, `src/web/board/BoardOverlay.tsx`, `overlayGeometry.ts`
- Bubble: `src/web/screens/CoachBubble.tsx`, `src/web/coach/coachState.ts`, `src/web/game/useCoach.ts`
- Types: `src/shared/coach/types.ts` (`CoachFact`, `COACH_FACT_SCHEMA_VERSION`)
- Tests: `tests/fixtures/coach/detectors.json`, `src/web/coach/detectors/detectors.fixtures.test.ts`, `tests/integration/coach-fixtures.test.ts`, `tests/unit/coach-wording.test.ts`, `tests/unit/coach/`, `tests/e2e/coach-detectors.spec.ts`, `coach-hints.spec.ts`, `coach-praise.spec.ts`, `game-feedback.spec.ts`

## Try again and Show me

After a mistake the kid can take the move back and look again, keep the move, or ask Pip to show the better one. The answer appears after a second miss or on Show me.

- State: `TRY_AGAIN`, `SHOW_ME`, `KEEP_MOVE` and `REVEAL_OK` in `src/web/game/reducer.ts`, nudge and reveal modes in `src/web/coach/coachState.ts`
- Buttons: retry actions in `src/web/screens/CoachBubble.tsx`
- Tests: `tests/e2e/try-again.spec.ts`

## Profiles and saved games

Each kid has a profile with their level, settings, stats and games. Games save as they're played and export as PGN.

- Storage: `src/server/db/library.ts`, `migrate.ts`, `migrations/`, `schemas.ts`, `routes.ts`, `fault.ts`
- Shared records: `src/shared/game/library.ts`, `record.ts`, `types.ts`
- Client: `src/web/game/libraryClient.ts`, `src/web/game/autosave.ts`
- Screens: `src/web/screens/ProfileScreens.tsx`
- Tests: `src/server/library.test.ts`, `tests/e2e/saved-game.spec.ts`, `picker.spec.ts`

## Post-game review

After a game Pip walks through up to five key moments. Past games open the same way.

- Moments: `src/shared/game/moments.ts` (`reviewMoments`, `isGreatMove`, `fixedMistake`)
- Screen: `src/web/screens/ReviewScreen.tsx`
- Tests: `tests/e2e/saved-game.spec.ts`

## Coach rephrasing with a local model

A parent connects Ollama or another OpenAI-compatible server and Pip's lines get warmer. The facts stay the same, and the built-in wording takes over on any failure.

- Server: `src/server/llm/` (`client.ts`, `rephrase.ts`, `brain.ts` with the circuit breaker, `recommended-models.json`), `/api/coach/rephrase` in `src/server/parent/routes.ts`
- Shared rules: `src/shared/coach/promptBuilder.ts`, `src/shared/coach/validateRephrase.ts`, `src/shared/coach/pieceWords.ts`
- Client: `src/web/game/useRephrasedMessage.ts`, `src/web/parent/client.ts`
- Measurements: [docs/llm-models.md](../llm-models.md)
- Tests: `src/server/llm/mockOpenAi.ts`, `tests/e2e/llm.spec.ts`

## Setup wizard and Parent settings

The first run asks for a parent PIN, a kid profile, and optionally a coach model. Settings, data export and network mode sit behind the PIN.

- Gate: `src/server/parent/gate.ts`, `src/server/parent/routes.ts`
- Screens: `src/web/parent/ParentScreen.tsx`, `CoachSettings.tsx`, `NetworkSettings.tsx`, wizard flow in `src/web/App.tsx`
- PIN reset: `reset-pin` in `src/server/cli.ts`
- Tests: `src/server/parent/parent.test.ts`, `tests/e2e/saved-game.spec.ts`

## Pip, stars, badges and read-aloud

Pip has five moods. Each game ends with 0 to 3 stars and sometimes a badge. Coach messages can be read aloud, and the kid can mute them.

- Pip: `src/web/screens/Pip.tsx`, art in `design/assets/pip/`
- Rewards: `src/shared/game/rewards.ts` (`starsForGame`, `gameBadges`), `src/web/screens/Rewards.tsx`
- Voice: `src/web/sound/readAloud.ts`
- Tests: `src/shared/game/rewards.test.ts`, `src/web/sound/readAloud.test.tsx`, `tests/e2e/result.spec.ts`

## Play on a tablet

The parent turns on Wi-Fi access and the tablet scans a QR code. The tablet runs its own engine against the same profiles.

- Server: `src/server/network.ts` (`requestAllowed`, `lanUrls`), network routes in `src/server/parent/routes.ts`
- Screen: `src/web/parent/NetworkSettings.tsx`
- Home screen install: `public/pawnpal.webmanifest`, `public/icons/`
- Tests: `src/server/network.test.ts`, `tests/e2e/tablet.spec.ts` and its snapshots

## Install from npm

A parent on macOS, Windows or Linux runs `npx pawnpal`.

- Build: `scripts/copy-engine.mjs`, `clean-server-dist.mjs`, `copy-migrations.mjs`, the `build` script in `package.json`
- Checks: `scripts/check-native-dependencies.mjs`, `check-licenses.mjs`, `installed-dependencies.mjs`, `package-smoke.mjs`
- Licenses: `THIRD_PARTY_NOTICES`, `src/web/licenses.test.ts`
- CI and publish: `.github/workflows/ci.yml`
- Manual checks: [docs/release-checklist.md](../release-checklist.md)

## Pip voice model training

Maintainers measure base models and fine-tune `pawnpal-pip`. None of it ships in the npm package.

- Pipeline: `training/baseline.ts`, `baseline-cases.ts`, `run-baseline.mjs`, runs written to `training/runs/`
- Shared rules: the same prompt builder and validator as rephrasing
- Tests: `tests/integration/model-baseline.test.ts`
