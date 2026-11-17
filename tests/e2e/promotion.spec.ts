import { expect, test } from "@playwright/test";
import { openDevFen } from "./helpers.js";

test("promotes a pawn to a knight from a development FEN", async ({ page }) => {
  await openDevFen(page, "7k/4P3/8/8/8/8/8/K7 w - - 0 1");
  const board = page.locator(".pp-board");
  await expect(board).toBeVisible();
  await board.locator('[data-square="e7"]').click();
  await board.locator('[data-square="e8"]').click();
  await page.getByRole("button", { name: "Knight" }).click();
  await expect(page.getByTestId("move").first()).toContainText("e8=N");
});
