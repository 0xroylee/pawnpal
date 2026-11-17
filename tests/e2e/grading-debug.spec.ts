import { expect, test } from "@playwright/test";
import { openDevFen } from "./helpers.js";

test("shows the grade when the kid hangs the queen", async ({ page }) => {
  await openDevFen(
    page,
    "rnbqkbnr/pppp1ppp/8/4p3/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2",
  );

  const board = page.locator(".pp-board");
  await board.locator('[data-square="d1"]').click();
  await board.locator('[data-square="d4"]').click();

  await expect(
    page.locator('tr[data-ply="1"] [data-testid="debug-grade"]'),
  ).toHaveText("blunder", { timeout: 8_000 });
  await expect(page.getByTestId("move")).toHaveCount(2, { timeout: 8_000 });
});
