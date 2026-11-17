import { expect, test } from "@playwright/test";
import { startAs } from "./helpers.js";

test("resigning requires confirmation", async ({ page }) => {
  await startAs(page, "White");
  await page.getByRole("button", { name: "Give up" }).click();
  await expect(page.getByText("Really give up?")).toBeVisible();
  await page.getByRole("button", { name: "Keep playing" }).click();
  await expect(page.getByRole("button", { name: "Give up" })).toBeVisible();

  await page.getByRole("button", { name: "Give up" }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();
  await expect(
    page.getByRole("heading", { name: "Computer wins this game." }),
  ).toBeVisible();
  await expect(page.locator(".pp-game__live")).toContainText(
    "Computer wins this game.",
  );
});
