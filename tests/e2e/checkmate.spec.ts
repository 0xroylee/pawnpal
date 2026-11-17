import { expect, test } from "@playwright/test";
import { openDevFen } from "./helpers.js";

test("shows the Fool's Mate checkmate result", async ({ page }) => {
  test.setTimeout(15_000);
  await openDevFen(
    page,
    "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
    "w",
  );
  await expect(
    page.getByRole("heading", { name: "Computer wins by checkmate." }),
  ).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".pp-game__live")).toContainText(
    "Computer wins by checkmate.",
  );
});
