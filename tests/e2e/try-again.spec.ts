import { expect, test, type Page } from "@playwright/test";
import { Chess } from "chess.js";
import type { ReplayRecording } from "../../src/web/engine/replayTransport.js";
import { openDevFen } from "./helpers.js";
import { loadDetectorFixture, recordingFor } from "./replay.js";

const firstMiss = loadDetectorFixture("missed-fork-1");
const best = loadDetectorFixture("played-fork-1");
const secondMiss = "a1b1";
const recording: ReplayRecording = {
  positions: [
    ...recordingFor(firstMiss).positions,
    recordingFor(best).positions[1]!,
    {
      // Stockfish lite-single at depth 12 after Kb1 in missed-fork-1.
      fen: "4k3/8/4q3/5N2/8/8/P7/1K6 b - - 1 1",
      lines: [
        {
          uci: "e6f5",
          san: "Qxf5+",
          cp: 692,
          depth: 12,
          pv: ["e6f5", "b1b2", "f5d3", "a2a4", "d3d2", "b2b3", "e8e7", "a4a5"],
        },
        {
          uci: "e6e4",
          san: "Qe4+",
          cp: 665,
          depth: 12,
          pv: ["e6e4", "b1b2", "e4e5", "b2c2", "e5f5", "c2b3"],
        },
      ],
    },
  ],
};

// A child can take back two misses, see a legal move, and continue from the
// restored board. The saved game keeps Ng7+ and the reply plus both attempts.
test("reveals a better move after a second miss", async ({ page }) => {
  await openPosition(page);
  await playMove(page, firstMiss.move);
  await expectNudge(page);
  const board = page.locator(".pp-board");
  await expect(board.locator('[data-square="f5"] .is-danger')).toBeVisible();
  await expect(
    board.locator('[data-square="a3"] [data-piece="wP"]'),
  ).toBeVisible();
  await board.evaluate((element) => {
    element.addEventListener("transitionrun", (event) => {
      if (
        event.propertyName === "transform" &&
        event.target instanceof Element &&
        event.target.matches('[data-square="a3"] [data-piece="wP"]')
      ) {
        element.setAttribute("data-takeback-motion", "true");
      }
    });
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(board).toHaveAttribute("data-takeback-motion", "true");
  await expect(
    board.locator('[data-square="a2"] [data-piece="wP"]'),
  ).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(0);

  await playMove(page, secondMiss);
  await expectReveal(page);
  await expect(
    board.locator('[data-square="a1"] [data-piece="wK"]'),
  ).toBeVisible();
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await expect(board.locator("[data-arrow-kind]")).toHaveCount(0);
  await playMove(page, best.move);
  await expect(page.getByTestId("move")).toHaveCount(2);

  const record = JSON.parse(
    (await page.getByTestId("debug-game-record").textContent())!,
  );
  const chess = new Chess();
  chess.loadPgn(record.pgn);
  expect(chess.history()).toHaveLength(2);
  expect(chess.history()[0]).toBe("Ng7+");
  expect(record.analyses[1].attempts).toMatchObject([
    { moveUci: "a2a3", grade: "blunder", usedShowMe: false, revealed: false },
    { moveUci: "a1b1", grade: "blunder", usedShowMe: false, revealed: true },
  ]);
});

test("praises a better retry and lets the computer reply", async ({ page }) => {
  await openPosition(page);
  await playMove(page, firstMiss.move);
  await page.getByRole("button", { name: "Try again" }).click();
  await playMove(page, best.move);
  await expect(page.getByText("That's better!", { exact: true })).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(2);
});

test("keeps the move, explains it, and lets the computer reply", async ({
  page,
}) => {
  await openPosition(page);
  await playMove(page, firstMiss.move);
  await expectNudge(page);
  await page.getByRole("button", { name: "Keep my move" }).click();
  await expect(
    page.locator('.pp-bubble__text[data-mode="explain"]'),
  ).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(2);
  await expect(page.getByTestId("move").first()).toContainText("a3");
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();
  await page
    .getByRole("button", { name: "Let's look at your game with Pip" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Game review" }),
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-arrow-kind="threat"][data-arrow-from="a2"][data-arrow-to="a3"]',
    ),
  ).toBeVisible();
  await expect(
    page.locator(
      '[data-arrow-kind="better"][data-arrow-from="f5"][data-arrow-to="g7"]',
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "See whole game" }).click();
  await expect(
    page.getByRole("button", { name: "1. a3 Big oops" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play as guest" }),
  ).toBeVisible();
});

test("shows the best move immediately and accepts the next move", async ({
  page,
}) => {
  await openPosition(page);
  await playMove(page, firstMiss.move);
  await page.getByRole("button", { name: "Show me" }).click();
  await expectReveal(page);
  await page.getByRole("button", { name: "OK", exact: true }).click();
  await playMove(page, firstMiss.move);
  await expect(page.getByTestId("move")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  const record = JSON.parse(
    (await page.getByTestId("debug-game-record").textContent())!,
  );
  expect(record.analyses[1].attempts).toMatchObject([
    { moveUci: "a2a3", usedShowMe: true, revealed: true },
  ]);
});

test("explains a blunder and continues when Try Again is off", async ({
  page,
}) => {
  await openPosition(page, false);
  await playMove(page, firstMiss.move);
  await expect(
    page.locator('.pp-bubble__text[data-mode="explain"]'),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByTestId("move")).toHaveCount(2);
});

async function openPosition(page: Page, offerTryAgain = true) {
  await page.addInitScript((replay: ReplayRecording) => {
    globalThis.__pawnpalReplay = replay;
  }, recording);
  await openDevFen(page, firstMiss.fen, firstMiss.kidColor, {
    replay: true,
    offerTryAgain,
  });
  await expect(page.locator(".pp-board")).toBeVisible();
}

async function playMove(page: Page, uci: string) {
  const board = page.locator(".pp-board");
  await board.locator(`[data-square="${uci.slice(0, 2)}"]`).click();
  await board.locator(`[data-square="${uci.slice(2, 4)}"]`).click();
}

async function expectNudge(page: Page) {
  const message = page.locator('.pp-bubble__text[data-mode="nudge"]');
  await expect(message).toBeVisible();
  await expect(message).not.toContainText(/Ng7|g7/);
  await expect(page.locator(".pp-board [data-arrow-kind]")).toHaveCount(0);
  await expect(page.getByTestId("move")).toHaveCount(1);
}

async function expectReveal(page: Page) {
  await expect(
    page.locator('.pp-bubble__text[data-mode="reveal"]'),
  ).toBeVisible();
  const arrow = page.locator(
    '[data-arrow-kind="better"][data-arrow-from="f5"][data-arrow-to="g7"]',
  );
  await expect(
    arrow.locator(
      'line[stroke="var(--pp-arrow-better)"]:not([stroke-dasharray])',
    ),
  ).toBeVisible();
  await expect(
    arrow.locator('line[stroke="var(--pp-arrow-halo)"]'),
  ).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(0);
}
