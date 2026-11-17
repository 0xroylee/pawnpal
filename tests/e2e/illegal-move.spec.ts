import { expect, test } from "@playwright/test";
import { startAs } from "./helpers.js";

test("an illegal drag snaps the piece back to its square", async ({ page }) => {
  await startAs(page, "White");
  const board = page.locator(".pp-board");
  const source = board.locator('[data-square="e2"] [data-piece]');
  await source.dragTo(board.locator('[data-square="e5"]'));

  await expect(board.locator('[data-square="e2"] [data-piece]')).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(0);
});
