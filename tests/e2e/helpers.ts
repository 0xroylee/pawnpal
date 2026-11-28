import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import type { Color } from "chess.js";
import type { Difficulty } from "../../src/shared/game/difficulty.js";
import type { Profile, SavedGame } from "../../src/shared/game/library.js";
import type { ReplayRecording } from "../../src/web/engine/replayTransport.js";
import { gameReducer, initialGame } from "../../src/web/game/reducer.js";
import { loadDetectorFixture, recordingFor } from "./replay.js";

// White mates with Ra8#. Black's queen can't reach the back rank to block,
// and it leaves White lost after any other move, so Stockfish grades Ra8# as
// the only move. A first game won this way earns First game, First win and
// First checkmate.
export const mateInOneFen = "6k1/5ppp/8/7q/8/8/5PPP/R5K1 w - - 0 1";

// Tests share one server, and repeated runs reuse it, so names must not clash.
export function uniqueName(prefix: string) {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

// Sets the parent PIN on a fresh server, or unlocks the parent area when
// another test set it first. It never saves a PIN over an existing one:
// that signs out every other test's parent session, even with the same PIN.
async function unlockParent(page: Page) {
  const password = { pin: "0427" };
  const status = (await (
    await page.request.get("/api/parent/status")
  ).json()) as { pinSet: boolean; unlocked: boolean };
  if (status.unlocked) return;
  if (!status.pinSet) {
    const bootstrap = await page.request.post("/api/parent/pin", {
      data: { ...password, confirm: password.pin },
    });
    if (bootstrap.ok()) return;
    expect(bootstrap.status(), "another test set the PIN first").toBe(401);
  }
  expect(
    (await page.request.post("/api/parent/unlock", { data: password })).ok(),
  ).toBe(true);
}

export async function createProfile(page: Page, name: string) {
  await unlockParent(page);
  const created = await page.request.post("/api/profiles", {
    data: { name, avatar: "owl" },
  });
  expect(created.ok()).toBe(true);
  return (await created.json()) as Profile;
}

// Saves a new game for the profile, so "Continue game" opens it.
export async function seedGame(
  page: Page,
  profileId: string,
  options: { fen?: string; kidColor?: Color; level?: Difficulty } = {},
) {
  const state = gameReducer(initialGame(), {
    type: "NEW_GAME",
    kidColor: options.kidColor ?? "w",
    fen: options.fen,
    level: options.level,
  });
  const saved = await page.request.post("/api/games", {
    data: { profileId, state },
  });
  expect(saved.ok()).toBe(true);
  return (await saved.json()) as SavedGame;
}

export async function pickProfile(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name, exact: true }).click();
}

export async function playMove(page: Page, uci: string) {
  const board = page.locator(".pp-board");
  await board.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
  await board.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
}

// Wins a seeded mate-in-one game through the real board and waits for the
// result card. The caller decides where to go next.
export async function winByCheckmate(
  page: Page,
  profile: Profile,
  level?: Difficulty,
) {
  await seedGame(page, profile.id, { fen: mateInOneFen, level });
  await pickProfile(page, profile.name);
  await page.getByRole("button", { name: "Continue game" }).click();
  await playMove(page, "a1a8");
  await expect(
    page.getByRole("heading", { name: "You win by checkmate!" }),
  ).toBeVisible();
}

// Every locator sits wholly inside the viewport while the page is unscrolled.
export async function expectOnFirstScreen(page: Page, locators: Locator[]) {
  expect(
    await page.evaluate(() => [window.scrollX, window.scrollY]),
    "the page is not scrolled",
  ).toEqual([0, 0]);
  for (const locator of locators)
    await expect(locator).toBeInViewport({ ratio: 1 });
}

export async function startAs(page: Page, color: "White" | "Black" = "White") {
  await page.goto("/");
  await page.getByRole("button", { name: "Play as guest" }).click();
  await page.getByRole("button", { name: color, exact: true }).click();
  await page.getByRole("button", { name: "Play!" }).click();
  await expect(page.locator(".pp-board")).toBeVisible();
}

export async function makeAnyLegalMove(page: Page, color: "w" | "b") {
  const board = page.locator(".pp-board");
  const pieceSquares = await board
    .locator(`[data-piece^="${color}"]`)
    .evaluateAll((pieces) =>
      [
        ...new Set(
          pieces.map((piece) =>
            piece.closest("[data-square]")?.getAttribute("data-square"),
          ),
        ),
      ].filter((square): square is string => Boolean(square)),
    );

  for (const square of pieceSquares) {
    await board.locator(`[data-square="${square}"]`).click();
    const targets = board.locator(".pp-sq.has-dot, .pp-sq.has-capture");
    if ((await targets.count()) === 0) continue;

    const target = await targets
      .first()
      .evaluate(
        (element) =>
          element.closest("[data-square]")?.getAttribute("data-square") ?? null,
      );
    if (target) {
      await board.locator(`[data-square="${target}"]`).click();
      const promotion = page.getByRole("dialog", {
        name: "Choose a piece to promote to",
      });
      if (await promotion.isVisible()) {
        await promotion.getByRole("button", { name: "Queen" }).click();
      }
      return;
    }
  }
  throw new Error(`No legal move was available for ${color}`);
}

export async function expectReplyWithinFiveSeconds(
  page: Page,
  previousMoves: number,
) {
  const keepMove = page.getByRole("button", {
    name: "Keep my move",
    exact: true,
  });
  let released = false;
  await expect
    .poll(
      async () => {
        if (!released && (await keepMove.isVisible())) {
          released = true;
          await keepMove.click();
        }
        return page.getByTestId("move").count();
      },
      { timeout: 5_000 },
    )
    .toBe(previousMoves + 2);
}

export async function openDevFen(
  page: Page,
  fen: string,
  color?: "w" | "b",
  options: {
    replay?: boolean;
    offerTryAgain?: boolean;
    level?: Difficulty;
  } = {},
) {
  const params = new URLSearchParams({ fen });
  if (color) params.set("color", color);
  if (options.replay) params.set("analyst", "replay");
  if (options.offerTryAgain === false) params.set("tryAgain", "off");
  if (options.level !== undefined) params.set("level", String(options.level));
  await page.goto(`/?${params.toString()}`);
}

// Opens `missed-fork-1` with the replay analyst. a2a3 is a recorded blunder
// that earns a nudge, and Ng7+ is the recorded fork that fixes it.
export async function openMissedFork(page: Page) {
  const miss = loadDetectorFixture("missed-fork-1");
  const fork = loadDetectorFixture("played-fork-1");
  const recording: ReplayRecording = {
    positions: [
      ...recordingFor(miss).positions,
      recordingFor(fork).positions[1]!,
    ],
  };
  await page.addInitScript((replay: ReplayRecording) => {
    globalThis.__pawnpalReplay = replay;
  }, recording);
  await openDevFen(page, miss.fen, miss.kidColor, { replay: true });
  await expect(page.locator(".pp-board")).toBeVisible();
  return { miss: miss.move, fork: fork.move };
}
