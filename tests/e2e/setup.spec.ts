import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Profile, SavedGame } from "../../src/shared/game/library.js";
import {
  createProfile,
  expectOnFirstScreen,
  pickProfile,
  uniqueName,
} from "./helpers.js";

const en = JSON.parse(
  readFileSync(new URL("../../src/web/i18n/en.json", import.meta.url), "utf8"),
) as Record<string, string>;
const levelText = (level: number) => ({
  name: en[`setup.level.${level}.name`]!,
  description: en[`setup.level.${level}.description`]!,
});

function setupParts(page: Page) {
  const levels = page.getByRole("group", { name: "Pick your opponent" });
  const sides = page.getByRole("group", { name: "Which side do you want?" });
  return {
    levels,
    sides,
    level: (level: number) =>
      levels.getByRole("button", {
        name: new RegExp(`^${levelText(level).name},`),
      }),
    description: page.locator('.pp-hello p[aria-live="polite"]'),
    play: page.getByRole("button", { name: "Play!", exact: true }),
  };
}

// Adds profiles until a new one lands below the fold, so a kid has to scroll
// the picker to reach it. The guest tile comes after it.
async function profileBelowTheFold(page: Page) {
  for (;;) {
    const profile = await createProfile(page, uniqueName("Scroll kid"));
    await page.goto("/");
    const tile = await page
      .getByRole("button", { name: profile.name, exact: true })
      .boundingBox();
    if (tile!.y >= page.viewportSize()!.height) return profile;
    for (let filler = 0; filler < 4; filler++)
      await createProfile(page, uniqueName("Filler kid"));
  }
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

async function scrollToAndClick(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  expect(await scrollY(page), "scrolled before the click").toBeGreaterThan(0);
  await target.click();
}

async function pickFromScrolledPicker(page: Page, name: string) {
  await page.goto("/");
  await scrollToAndClick(page, page.getByRole("button", { name, exact: true }));
}

async function expectSetupOnOneScreen(page: Page) {
  await expect(setupParts(page).play).toBeVisible();
  const { top, scrollHeight, innerHeight } = await page.evaluate(() => ({
    top: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(top, "setup opens at the top").toBe(0);
  expect(scrollHeight, "the page doesn't scroll").toBeLessThanOrEqual(
    innerHeight,
  );
  await expectOnFirstScreen(page, [setupParts(page).play]);
}

test("picks the opponent and the side with tiles", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Play as guest" }).click();
  const setup = setupParts(page);
  await expect(setup.levels.getByRole("button")).toHaveCount(8);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.locator("select")).toHaveCount(0);
  await expect(setup.level(1)).toHaveAttribute("aria-pressed", "true");
  await expect(setup.description).toHaveText(levelText(1).description);

  for (const level of [8, 3, 1, 6, 2, 7, 4, 5]) {
    const tile = setup.level(level);
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await expect(
      setup.levels.getByRole("button", { pressed: true }),
    ).toHaveCount(1);
    await expect(
      setup.sides.getByRole("button", { pressed: true }),
    ).toHaveCount(1);
    const meter = tile.getByRole("img", { name: `Level ${level} of 8` });
    await expect(meter).toBeVisible();
    await expect(meter.locator("i.on")).toHaveCount(level);
    await expect(setup.description).toHaveText(levelText(level).description);
  }

  for (const side of ["Black", "Surprise me", "White"]) {
    const tile = setup.sides.getByRole("button", { name: side, exact: true });
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "true");
    await expect(
      setup.sides.getByRole("button", { pressed: true }),
    ).toHaveCount(1);
    await expect(
      setup.levels.getByRole("button", { pressed: true }),
    ).toHaveCount(1);
    await expect(setup.level(5)).toHaveAttribute("aria-pressed", "true");
  }
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
]) {
  test(`opens setup at the top and fits it on one screen at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const profile = await profileBelowTheFold(page);

    await pickFromScrolledPicker(page, "Play as guest");
    await expectSetupOnOneScreen(page);

    await pickFromScrolledPicker(page, profile.name);
    await expect(
      page.getByRole("button", { name: "Game history" }),
    ).toBeVisible();
    await expectSetupOnOneScreen(page);
  });
}

test("starts the game at the top after scrolling down to Play!", async ({
  page,
}) => {
  // A short laptop window, where the setup screen is taller than the window.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/");
  await page.getByRole("button", { name: "Play as guest" }).click();
  await scrollToAndClick(page, setupParts(page).play);
  await expect(page.locator(".pp-board")).toBeVisible();
  expect(await scrollY(page), "the game opens at the top").toBe(0);
});

test("opens the parent's profile form at the top of the page", async ({
  page,
}) => {
  const viewport = { width: 1280, height: 800 };
  await page.setViewportSize(viewport);
  await createProfile(page, uniqueName("Parent kid"));
  const add = page.getByRole("button", { name: "Add profile", exact: true });
  for (;;) {
    await page.goto("/");
    await page.getByRole("button", { name: "Parent settings" }).click();
    await page.getByRole("button", { name: "Profiles", exact: true }).click();
    if ((await add.boundingBox())!.y >= viewport.height) break;
    for (let filler = 0; filler < 6; filler++)
      await createProfile(page, uniqueName("Filler kid"));
  }
  await scrollToAndClick(page, add);
  await expect(
    page.getByRole("heading", { name: "Add profile", exact: true }),
  ).toBeVisible();
  expect(await scrollY(page), "the form opens at the top").toBe(0);
});

test("starts the game at the chosen level and side", async ({ page }) => {
  const profile = await createProfile(page, uniqueName("Owl kid"));
  await pickProfile(page, profile.name);
  const setup = setupParts(page);
  await setup.level(5).click();
  await setup.sides.getByRole("button", { name: "Black", exact: true }).click();
  await setup.play.click();

  // The computer has White and moves first. Black's pieces face the kid.
  const board = page.locator(".pp-board");
  await expect(page.getByTestId("move")).toHaveCount(1);
  const a1 = await board.locator('[data-square="a1"]').boundingBox();
  const a8 = await board.locator('[data-square="a8"]').boundingBox();
  expect(a1!.y).toBeLessThan(a8!.y);

  const profiles = (await (
    await page.request.get("/api/profiles")
  ).json()) as Profile[];
  const gameId = profiles.find(({ id }) => id === profile.id)?.activeGameId;
  expect(gameId).toEqual(expect.any(String));
  const game = (await (
    await page.request.get(`/api/games/${gameId}`)
  ).json()) as SavedGame;
  expect({ level: game.level, kidColor: game.state.kidColor }).toEqual({
    level: 5,
    kidColor: "b",
  });
});
