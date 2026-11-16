# 12: Release

**Depends on:** all

## Goal

Ship pawnpal 0.1.0 to npm so a parent on macOS, Windows or Linux can run `npx pawnpal`, with documentation and license compliance in place.

## Scope

**Documentation**
- `README.md`:
  - what it is, with a screenshot or short GIF
  - requirements: Node 22.13+, a modern browser, and Ollama (optional)
  - quick start
  - connecting an LLM (Ollama, LM Studio, a custom server)
  - tablet mode
  - where data lives and how to back it up
  - privacy statement
  - FAQ ("the levels feel too easy or too hard", "the coach is slow")
  - credits: Stockfish, chess.js, react-chessboard, the horsey piece set (cham and michael1241, CC BY-NC-SA 4.0), and the post that inspired this
  - license, including that the horsey art is non-commercial and how to switch it out
- `docs/llm-models.md`: measured models with validator pass rate and latency on reference machines (from spec 08).
- `CONTRIBUTING.md`:
  - dev setup and test commands
  - how to add a detector (write the fixtures first)
  - how to add a language (copy `en.json`, translate, register it)

**License compliance**
- `LICENSE` (GPL-3.0).
- `THIRD_PARTY_NOTICES`, generated from dependency licenses by a script.
- CI fails on any production dependency license that isn't compatible with GPL-3.0.
- **Exception: horsey piece art.** It ships unmodified as a separately licensed asset (CC BY-NC-SA 4.0) with its own `LICENSE.md`.
  - The license check allows exactly that folder and fails on any other NonCommercial asset.
  - `THIRD_PARTY_NOTICES` lists it.
  - The app's About screen credits the authors and links the license.
  - A check confirms the SVGs still match the pinned Lichess commit byte for byte.

**Package contents**
- `files`: `bin`, `dist`, `LICENSE`, `THIRD_PARTY_NOTICES`, `README.md`.
- `npm pack --dry-run` is checked in CI. Size limit: 20 MB unpacked.

**CI**

| Job | Runs on | Checks |
|---|---|---|
| Test matrix | ubuntu, macos, windows × Node 22, 24 | typecheck, lint, unit |
| End-to-end | all three OSes | Chromium |
| End-to-end, WebKit | macOS | WebKit |
| Smoke test | all three OSes | see below |

The smoke test:
1. `npm pack`.
2. Install the tarball into a temp directory.
3. Run `npx pawnpal --no-open --port 0`.
4. Check that `GET /api/health` returns 200.
5. Send SIGINT and check the exit code is 0.

**Publishing**
- On a `v*` tag, run CI, publish to npm with provenance, and create a GitHub release with a changelog.
- Semver. The first public version is 0.1.0.

**Manual release checklist** (`docs/release-checklist.md`)
- Fresh macOS and Windows machines: time the path from `npx pawnpal` to the first move. Target under 3 minutes without an LLM.
- iPad on home Wi-Fi: QR scan, a full game, read-aloud (spec 11 and 10 manual checks).
- Ollama with the small-tier model: the wizard test passes, and coach rewording appears in a game.
- Calibration report (spec 02) is current.

## Out of scope

Homebrew/winget packages, desktop installers, a hosted demo site.

## Acceptance criteria

1. The CI matrix is green on all three OSes and both Node versions.
2. The smoke test passes on all three OSes from the packed tarball.
3. `npm pack --dry-run` lists only the allowed files and stays under 20 MB unpacked.
4. The license check passes, `THIRD_PARTY_NOTICES` is up to date, and the horsey files match the pinned source with their license and credit in place.
5. The README quick start works as written on a fresh machine (checked off in the checklist).
6. Pushing a `v0.1.0` tag publishes to npm with provenance and creates a GitHub release.

## Test plan

CI jobs above, plus the manual checklist.

## Open questions

- Whether to reserve the `pawnpal` npm name early with a placeholder 0.0.0 release. Recommended: yes, as soon as spec 01 is merged.
