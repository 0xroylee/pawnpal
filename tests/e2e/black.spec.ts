import { expect, test } from "@playwright/test";
import {
  expectReplyWithinFiveSeconds,
  makeAnyLegalMove,
  startAs,
} from "./helpers.js";

test("Computer moves first when the kid chooses Black", async ({ page }) => {
  test.setTimeout(30_000);
  await startAs(page, "Black");
  await expect
    .poll(() => page.getByTestId("move").count(), { timeout: 5_000 })
    .toBe(1);

  await expect(page.locator(".pp-game__live")).toContainText("Computer moved");
  await expect(page.getByText("Your move", { exact: true })).toBeVisible();
  await makeAnyLegalMove(page, "b");
  await expectReplyWithinFiveSeconds(page, 1);
});
