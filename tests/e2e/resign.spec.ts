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

test("keeps the guest opponent choice for another game and after reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play as guest" }).click();
  const level = page.getByRole("combobox", { name: "Opponent level" });
  await expect(level.getByRole("option")).toHaveCount(8);
  await level.selectOption({ label: "Dragon" });
  await expect(
    page.getByRole("img", { name: "8 out of 8 difficulty stars" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Black", exact: true }).click();
  await page.getByRole("button", { name: "Play!", exact: true }).click();
  await expect(page.getByTestId("move")).toHaveCount(1);
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(level).toHaveValue("8");
  await page.reload();
  await page.getByRole("button", { name: "Play as guest" }).click();
  await expect(level).toHaveValue("8");
});
