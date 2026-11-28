# Contributing to Pawnpal

Use Bun 1.4.4 and Node.js 22.13 or newer. Install the locked dependencies, then start the local server and web development build.

```sh
bun install --frozen-lockfile
bun run dev
```

Run the same checks as CI before sending a change.

```sh
bun run typecheck
bun run lint
bun run check:native
bun run check:licenses
bun run test
bun run playwright install chromium
bun run build
bun run e2e
```

The package smoke test uses npm to install and run the tarball as a player would.

```sh
npm run smoke:package
```

On macOS, install the Playwright WebKit browser and run the `tablet` project with `PAWNPAL_E2E_WEBKIT=1`. For a release, also run the full difficulty calibration. [Calibration instructions](tools/calibrate/README.md)

## Add a chess detector

Start with a replay fixture in `tests/fixtures/coach/detectors.json` that records the position, the player’s move, and Stockfish’s fixed-depth lines. Include a position where the detector should stay quiet. Follow the public detector contract in `src/web/coach/detectors/`, register the detector in `index.ts`, and add the templates it uses to `src/web/i18n/en.json`. Run the fixture and wording suites before exercising it in the browser.

## Add a translation

Copy `src/web/i18n/en.json` with the new locale code, keep its keys and placeholders, and translate the values. Register the locale in the message loader at `src/web/i18n/t.ts` and extend the language and validator contracts before offering it in the UI. Run the i18n scan and the coach wording tests. English is the current app language.

If you change a shipping dependency, regenerate the bundled notices with `node scripts/check-licenses.mjs --write` and review the changes.
