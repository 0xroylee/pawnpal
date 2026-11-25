# Pawnpal 0.1.0 release checklist

Record the date, machine and result next to each manual check.

- [ ] On a fresh Mac, run `npx pawnpal` and reach the first move within three minutes with the built-in coach.
- [ ] Repeat the same check on a fresh Windows machine.
- [ ] On a physical iPad (2020 or newer), scan the Wi-Fi QR code, play a full game, check move and grading times, hear Pip after the first Play tap, and open the app from an Add to Home Screen shortcut.
- [x] With Qwen3 1.7B on the M4 Pro, the real Ollama setup test accepted a reply in 265 ms and a coaching message showed the model’s wording during play on 2026-11-25. [Model measurements](llm-models.md)
- [x] Run the 1,600-game Stockfish difficulty calibration. All eight pairings passed on 2026-11-25. [Calibration](../tools/calibrate/results/2026-11-25.md)
- [ ] Confirm the GitHub Actions matrix and package smoke jobs pass on macOS, Windows and Linux.
- [x] Connect the public GitHub repository. [0xroylee/pawnpal](https://github.com/0xroylee/pawnpal)
- [ ] Authorize `.github/workflows/ci.yml` to publish on npm. The workflow accepts a publishing token as the `NPM_TOKEN` secret for bootstrapping the package and supports npm trusted publishing. Publish with provenance and verify the GitHub release from tag `v0.1.0`. [npm publishing with provenance](https://docs.npmjs.com/generating-provenance-statements/)

## Local verification on 2026-11-25

- M4 Pro Mac. All 645 automated tests passed on Node 22.20 and Node 24.7. All 31 Chromium and WebKit tests passed, including both tablet layouts, touch input, the wizard and saved games.
- The macOS tarball smoke test installed the package into a temporary directory, verified `/api/health` and shut down cleanly on SIGINT. The package contains 55 files and is about 4.49 MB unpacked.
- A scripted install from the local tarball with a fresh data folder reached the first move in 1.85 seconds with the built-in coach.
- The Linux tarball smoke test passed on Debian with Node 22.23.5.
- The 60-move history review opened in 45 ms and displayed all 120 plies. LAN requests reached two private addresses. The protected settings still required the PIN, and `reset-pin` revoked the session.
