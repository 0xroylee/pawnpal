import { expect, test, type Page } from "@playwright/test";
import {
  createProfile,
  expectOnFirstScreen,
  expectReplyWithinFiveSeconds,
  openMissedFork,
  pickProfile,
  playMove,
  uniqueName,
  winByCheckmate,
} from "./helpers.js";

const threeBadges = [
  "New badge! First game",
  "New badge! First win",
  "New badge! First checkmate",
];

function resultParts(page: Page) {
  return {
    main: page.getByRole("button", {
      name: "Let's look at your game with Pip",
    }),
    playAgain: page.getByRole("button", { name: "Play again" }),
    home: page.getByRole("button", { name: "Home" }),
    saved: page.getByRole("status").filter({ hasText: "Game saved" }),
    badges: page.locator('ul[aria-live="polite"]').getByRole("listitem"),
    stats: page.locator(".pp-result .pp-stat"),
  };
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
]) {
  test(`fits a three-badge checkmate win on one screen at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const profile = await createProfile(page, uniqueName("Checkmate kid"));
    await winByCheckmate(page, profile);

    const result = resultParts(page);
    await expect(page.locator(".pp-board")).toHaveCount(0);
    await expect(
      page.getByRole("img", { name: "3 out of 3 stars" }),
    ).toBeVisible();
    // Ra8# is graded after the game ends, so the Great moves tile can follow
    // the result card by a few seconds.
    await expect(result.stats).toHaveText(
      [/^Great moves\s*1$/, /^Moves\s*1$/],
      { timeout: 10_000 },
    );
    await expect(result.badges).toHaveText(threeBadges);
    await expect(result.saved).toBeVisible();

    const tops = await result.badges.evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size, "the badges share one row").toBe(1);
    await expectOnFirstScreen(page, [
      result.main,
      result.playAgain,
      result.home,
      result.saved,
    ]);
  });
}

test("opens the game review from the result card", async ({ page }) => {
  const profile = await createProfile(page, uniqueName("Review kid"));
  await winByCheckmate(page, profile);
  await resultParts(page).main.click();
  await expect(
    page.getByRole("heading", { name: "Game review" }),
  ).toBeVisible();
});

test("starts a new game from Play again", async ({ page }) => {
  const profile = await createProfile(page, uniqueName("Again kid"));
  await winByCheckmate(page, profile);
  await resultParts(page).playAgain.click();
  await expect(
    page.getByRole("heading", { name: "Let's play chess!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play!", exact: true }).click();
  await expect(page.locator(".pp-board")).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Give up", exact: true }),
  ).toBeVisible();
});

test("shows one star and one badge after giving up a first game, then goes home", async ({
  page,
}) => {
  const profile = await createProfile(page, uniqueName("Resign kid"));
  await pickProfile(page, profile.name);
  await page.getByRole("button", { name: "Play!", exact: true }).click();
  await playMove(page, "e2e4");
  await expectReplyWithinFiveSeconds(page, 0);
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();

  const result = resultParts(page);
  await expect(
    page.getByRole("heading", { name: "Computer wins this game." }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "1 out of 3 stars" }),
  ).toBeVisible();
  await expect(result.badges).toHaveText(["New badge! First game"]);
  await expect(result.stats).toHaveText([/^Moves\s*1$/]);
  await expect(result.saved).toBeVisible();

  await result.home.click();
  await expect(
    page.getByRole("heading", { name: "Who's playing?" }),
  ).toBeVisible();
});

test("counts a mistake fixed with Try again on the result card", async ({
  page,
}) => {
  const { miss, fork } = await openMissedFork(page);
  await playMove(page, miss);
  await page.getByRole("button", { name: "Try again" }).click();
  await playMove(page, fork);
  await expect(page.getByText("That's better!", { exact: true })).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(2);
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();

  await expect(
    page.getByRole("heading", { name: "Computer wins this game." }),
  ).toBeVisible();
  await expect(resultParts(page).stats).toHaveText([
    /^Great moves\s*1$/,
    /^Fixed it\s*1$/,
    /^Moves\s*1$/,
  ]);
});
