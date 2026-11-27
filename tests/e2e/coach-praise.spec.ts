import { expect, test, type Locator } from "@playwright/test";
import { expectReplyWithinFiveSeconds, openDevFen } from "./helpers.js";

async function play(board: Locator, from: string, to: string) {
  await board.locator(`[data-square="${from}"]`).click();
  await board.locator(`[data-square="${to}"]`).click();
}

test("praises the only move", async ({ page }) => {
  // `played-fork-1` records a large gap between `Ng7+` and the alternatives.
  await openDevFen(page, "4k3/8/4q3/5N2/8/8/P7/K7 w - - 0 1", "w");
  const board = page.locator(".pp-board");
  await expect(board).toBeVisible();
  await play(board, "f5", "g7");

  await expect(page.locator(".pp-grade--great")).toBeVisible({
    timeout: 8_000,
  });
  await expect(
    page.locator('.pp-bubble__text[data-mode="praise"]'),
  ).toBeVisible();
  await expectReplyWithinFiveSeconds(page, 0);
});

test("stays quiet on ordinary moves", async ({ page }) => {
  // Black's king has one legal reply after each kid move (Ka2, then Ka3), so
  // the computer's answer is forced and every run plays the same game. Both
  // moves keep a forced mate and neither is the only good move (Stockfish 19,
  // depth 14), so Pip has nothing to praise or correct. The computer replies
  // only after the kid's move is graded, so each check sees the final state.
  await openDevFen(page, "8/8/8/8/8/8/8/k2KQ3 w - - 0 1", "w");
  const board = page.locator(".pp-board");
  await expect(board).toBeVisible();
  const bubble = page.locator(".pp-bubble__text");

  await play(board, "d1", "c1");
  await expectReplyWithinFiveSeconds(page, 0);
  await expect(
    board.locator('[data-square="a2"] [data-piece="bK"]'),
  ).toBeVisible();
  await expect(bubble).toHaveCount(0);

  await play(board, "c1", "c2");
  await expectReplyWithinFiveSeconds(page, 2);
  await expect(
    board.locator('[data-square="a3"] [data-piece="bK"]'),
  ).toBeVisible();
  await expect(bubble).toHaveCount(0);
});
