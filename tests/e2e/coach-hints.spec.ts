import { expect, test } from "@playwright/test";
import { openDevFen } from "./helpers.js";

test("hints reveal a square, a nudge, then the best-move arrow", async ({
  page,
}) => {
  // `allowed-mate-1` records `d7e7` as the best move before the kid's turn.
  await openDevFen(page, "8/3R4/1q4N1/8/4k3/4q1p1/4R3/7K w - - 0 1", "w");
  const board = page.locator(".pp-board");
  await expect(board).toBeVisible();

  await page.locator(".pp-player__hint").click();
  await expect(board.locator('[data-square="d7"] .pp-sq.is-hint')).toBeVisible({
    timeout: 8_000,
  });
  await expect(board.locator(".pp-sq.is-hint")).toHaveCount(1);

  await page.locator(".pp-player__hint").click();
  await expect(
    page.locator('[data-testid="coach-text"][data-mode="hint2"]'),
  ).toBeVisible({ timeout: 8_000 });
  await expect(board.locator(".pp-sq.is-hint")).toHaveCount(1);

  await page.locator(".pp-player__hint").click();
  await expect(
    page.locator('[data-testid="coach-text"][data-mode="hint3"]'),
  ).toBeVisible();
  await expect(board.locator('[data-arrow-kind="better"]')).toBeVisible();
  await expect(page.locator(".pp-player__hint")).toBeDisabled();

  await board.locator('[data-square="d7"]').click();
  await board.locator('[data-square="e7"]').click();
  await expect(board.locator(".pp-sq.is-hint")).toHaveCount(0);
  await expect(board.locator("[data-arrow-kind]")).toHaveCount(0);
});
