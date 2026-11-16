# 11: Tablet mode (home network)

**Depends on:** 01. The parent toggle lands with spec 09; until then, a `--lan` CLI flag turns it on.

## Goal

A kid can play on a tablet in the house, against the same profiles, without the parent setting up anything beyond one switch and a QR code scan.

## Scope

**Turning it on**
- The `--lan` flag and the parent-area toggle make the server listen on `0.0.0.0` instead of `127.0.0.1`. The listener restarts in-process. The setting persists.
- While it's on, a banner on localhost reads: "Other devices on your Wi-Fi can open pawnpal."

**Showing the address**
- The parent area lists the URL for each private IPv4 address of the active network interfaces, with a QR code (`qrcode` package, MIT).
- The terminal prints the same URLs at startup.

**Network safety**
- Only loopback and private-range clients are accepted: `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `fc00::/7`, `fe80::/10`. Others get 403.
- The `Host` header must be `localhost`, `127.0.0.1`, `[::1]` or one of the machine's LAN addresses with the right port. This blocks DNS-rebinding attacks.
- The parent gate (spec 09) applies on every device.

**Engine on tablets.** Over plain http on the LAN, `crossOriginIsolated` is false, so the single-threaded lite build loads (the fallback from spec 01). Levels (02) and grading (03) must meet their timing targets on it.

**Touch and layout**
- Tap-to-move is the main input on touch devices, and drag also works.
- `touch-action: none` on the board, so dragging a piece doesn't scroll or zoom the page.
- Buttons are at least 44×44 px. Nothing is hover-only.
- At 768 px wide and above:
  - landscape: board on the left, coach on the right
  - portrait: board on top, coach below
- Phones (under 768 px) are usable but not optimized.

**Home screen app.** A web app manifest and icons, so "Add to Home Screen" on an iPad opens pawnpal full screen. There's no service worker or offline mode, because the computer's server must be running anyway.

## Out of scope

HTTPS on the LAN, internet access from outside the home, phone-optimized layout, offline play on the tablet.

## Acceptance criteria

1. Without the flag or toggle, the server only answers on `127.0.0.1`.
2. With it on, another device on the LAN can load the app from the printed URL or the QR code.
3. A request from a public IP (simulated) gets 403. A request with a foreign `Host` header gets 403.
4. Parent routes ask for the PIN on the tablet even after the parent unlocked them on the computer.
5. On the tablet, the engine runs the lite build. Grading meets spec 03's target, and each level meets spec 02's 1 s target, on an iPad from 2020 or later (manual check).
6. Pieces can be moved by tap and by drag on touch without the page scrolling (Playwright WebKit with touch emulation).
7. Landscape and portrait layouts render correctly at 768×1024 and 1024×768 (screenshot tests).
8. Turning the toggle off switches back to `127.0.0.1` without restarting the app.

## Test plan

- **Unit:** client IP filter, Host header check, LAN address listing.
- **End-to-end:** Playwright WebKit with touch emulation at tablet sizes; screenshot comparisons for both orientations.
- **Manual:** a real iPad on home Wi-Fi: QR scan, play a full game, Add to Home Screen.

## Open questions

- Whether to show a QR code in the terminal too (`qrcode-terminal`). Low cost; decide during implementation.
