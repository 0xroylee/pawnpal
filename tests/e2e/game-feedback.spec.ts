import { expect, test, type Page } from "@playwright/test";
import { expectOnFirstScreen, openMissedFork, playMove } from "./helpers.js";

function hintButton(page: Page) {
  return page.getByRole("button", { name: /^(Hint|More help)$/ });
}

async function nudge(page: Page) {
  const { miss } = await openMissedFork(page);
  await playMove(page, miss);
  const panel = page.locator('.pp-feedback[data-mode="nudge"]');
  await expect(panel).toBeVisible();
  return panel;
}

test("shows a mistake in the feedback panel and pauses hints while Pip talks", async ({
  page,
}) => {
  const { miss } = await openMissedFork(page);
  const hint = hintButton(page);
  await expect(hint).toHaveText("Hint");
  await expect(hint).toBeEnabled();
  await expect(hint).toHaveAccessibleDescription("");

  await playMove(page, miss);
  const panel = page.locator('.pp-feedback[data-mode="nudge"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("coach-text")).toHaveAttribute(
    "data-mode",
    "nudge",
  );
  await expect(page.locator(".pp-bubble")).toHaveCount(0);

  // The kit's feedback panel ends on the main action. The buttons may wrap,
  // so they're on screen in reading order: row by row, left to right.
  const actions = panel.locator(".pp-feedback__actions").getByRole("button");
  await expect(actions).toHaveText(["Keep my move", "Show me", "Try again"]);
  const boxes = await actions.evaluateAll((buttons) =>
    buttons.map((button) => {
      const { top, left } = button.getBoundingClientRect();
      return { top: Math.round(top), left: Math.round(left) };
    }),
  );
  expect(
    boxes.every(
      (box, index) =>
        index === 0 ||
        box.top > boxes[index - 1]!.top ||
        (box.top === boxes[index - 1]!.top &&
          box.left > boxes[index - 1]!.left),
    ),
    `buttons in reading order: ${JSON.stringify(boxes)}`,
  ).toBe(true);

  await expect(hint).toHaveText("Hint");
  await expect(hint).toBeDisabled();
  await expect(hint).toHaveAccessibleDescription("Listen to Pip first");
  await expect(
    page.getByText("Listen to Pip first", { exact: true }),
  ).toBeVisible();
});

test("says all the help is used after the last hint", async ({ page }) => {
  await openMissedFork(page);
  const board = page.locator(".pp-board");
  const hint = hintButton(page);

  await hint.click();
  await expect(board.locator(".pp-sq.is-hint")).toHaveCount(1);
  await expect(hint).toHaveText("More help");
  await expect(hint).toHaveAccessibleDescription("");
  await hint.click();
  await expect(
    page.locator('[data-testid="coach-text"][data-mode="hint2"]'),
  ).toBeVisible();
  await hint.click();
  await expect(
    page.locator('[data-testid="coach-text"][data-mode="hint3"]'),
  ).toBeVisible();

  await expect(hint).toBeDisabled();
  await expect(hint).toHaveAccessibleDescription(
    "That's all the help for this move",
  );
  await expect(
    page.getByText("That's all the help for this move", { exact: true }),
  ).toBeVisible();
});

test("drops the board and the hint button when the game ends", async ({
  page,
}) => {
  await openMissedFork(page);
  await expect(hintButton(page)).toBeVisible();
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();
  await expect(
    page.getByRole("heading", { name: "Computer wins this game." }),
  ).toBeVisible();
  await expect(page.locator(".pp-board")).toHaveCount(0);
  await expect(hintButton(page)).toHaveCount(0);
});

test("keeps the nudge actions on screen in portrait at 768×1024", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const panel = await nudge(page);
  await expectOnFirstScreen(page, [
    panel.getByRole("button", { name: "Try again" }),
    panel.getByRole("button", { name: "Show me" }),
    panel.getByRole("button", { name: "Keep my move" }),
  ]);
});
