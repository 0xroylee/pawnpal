import { expect, test } from "@playwright/test";
import { openDevFen } from "./helpers.js";

test("shows the Fool's Mate checkmate result", async ({ page }) => {
  test.setTimeout(15_000);
  await openDevFen(
    page,
    "rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",
    "w",
    { level: 3 },
  );
  const board = page.locator(".pp-board");
  await board.locator('[data-square="g2"]').click();
  await board.locator('[data-square="g4"]').click();
  const keepMove = page.getByRole("button", {
    name: "Keep my move",
    exact: true,
  });
  await expect(keepMove).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("move")).toHaveCount(1);
  await keepMove.click();
  await expect(
    page.getByRole("heading", { name: "Computer wins by checkmate." }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".pp-game__live")).toContainText(
    "Computer wins by checkmate.",
  );
});
