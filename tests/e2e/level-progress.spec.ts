import { expect, test, type Page } from "@playwright/test";
import type {
  LevelSuggestion,
  Profile,
} from "../../src/shared/game/library.js";
import { createProfile, uniqueName, winByCheckmate } from "./helpers.js";

const snailBeaten = "Sleepy Snail, Level 1 of 8, Beaten";
const kittenBeaten = "Curious Kitten, Level 2 of 8, Beaten";

type BeatenWatch = Window & { __beatenSeen?: string[] };

function opponents(page: Page) {
  return page
    .getByRole("group", { name: "Pick your opponent" })
    .getByRole("button");
}

function beatenOnScreen(page: Page) {
  return opponents(page).evaluateAll((tiles) =>
    tiles
      .map((tile) => tile.getAttribute("aria-label") ?? "")
      .filter((label) => label.endsWith(", Beaten")),
  );
}

// Collects every level tile label that says "Beaten" from now on, so a mark
// that flashes on screen between two checks still fails the test.
async function watchBeaten(page: Page) {
  await page.evaluate(() => {
    const state = window as BeatenWatch;
    const installed = state.__beatenSeen !== undefined;
    state.__beatenSeen = [];
    const record = () => {
      for (const tile of document.querySelectorAll(".pp-level[aria-label]")) {
        const label = tile.getAttribute("aria-label") ?? "";
        if (label.endsWith(", Beaten") && !state.__beatenSeen!.includes(label))
          state.__beatenSeen!.push(label);
      }
    };
    if (!installed)
      new MutationObserver(record).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-label"],
      });
    record();
  });
}

const beatenSeen = (page: Page) =>
  page.evaluate(() => (window as BeatenWatch).__beatenSeen);

// Picks the profile and waits until its beaten levels and level suggestion
// have loaded and rendered.
async function openSetup(page: Page, profile: Profile) {
  const loaded = ["stats", "suggestion"].map((path) =>
    page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/profiles/${profile.id}/${path}`) &&
        response.ok(),
    ),
  );
  await page.getByRole("button", { name: profile.name, exact: true }).click();
  await Promise.all(loaded);
  await expect(opponents(page)).toHaveCount(8);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

async function expectPicker(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Who's playing?" }),
  ).toBeVisible();
}

async function backToPicker(page: Page) {
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expectPicker(page);
}

test("marks beaten levels only for the profile that beat them", async ({
  page,
}) => {
  const first = await createProfile(page, uniqueName("Snail beater"));
  const second = await createProfile(page, uniqueName("Kitten beater"));

  await winByCheckmate(page, first);
  await page.getByRole("button", { name: "Play again" }).click();
  await expect.poll(() => beatenOnScreen(page)).toEqual([snailBeaten]);
  await expect(
    opponents(page).filter({ hasText: "Sleepy Snail" }),
  ).toHaveAccessibleName(snailBeaten);

  await backToPicker(page);
  await watchBeaten(page);
  await page.getByRole("button", { name: "Play as guest" }).click();
  await expect(opponents(page)).toHaveCount(8);
  expect(await beatenOnScreen(page)).toEqual([]);
  expect(await beatenSeen(page), "a guest never sees marks").toEqual([]);

  await backToPicker(page);
  await watchBeaten(page);
  await openSetup(page, second);
  expect(await beatenOnScreen(page)).toEqual([]);
  expect(await beatenSeen(page), "a fresh profile never sees marks").toEqual(
    [],
  );

  await winByCheckmate(page, second, 2);
  await page.getByRole("button", { name: "Play again" }).click();
  await expect.poll(() => beatenOnScreen(page)).toEqual([kittenBeaten]);

  for (const [profile, own] of [
    [first, snailBeaten],
    [second, kittenBeaten],
    [first, snailBeaten],
  ] as const) {
    await backToPicker(page);
    await watchBeaten(page);
    await openSetup(page, profile);
    expect(await beatenOnScreen(page)).toEqual([own]);
    expect(
      await beatenSeen(page),
      `${profile.name} only ever sees their own mark`,
    ).toEqual([own]);
  }
});

// Three wins in a row at the profile's level make the server suggest the next
// level when the third game is saved.
async function earnLevelUp(page: Page, profile: Profile) {
  for (let win = 1; win <= 3; win++) {
    await winByCheckmate(page, profile);
    if (win < 3) {
      await page.getByRole("button", { name: "Home" }).click();
      await expectPicker(page);
    }
  }
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(
    page.getByText("Ready to try level 2?", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => beatenOnScreen(page)).toEqual([snailBeaten]);
}

async function expectAnswered(page: Page, profile: Profile, level: number) {
  await expect(page.getByText("Ready to try level 2?")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try it" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stay here" })).toHaveCount(0);
  await expect(
    opponents(page).and(page.getByRole("button", { pressed: true })),
  ).toHaveAccessibleName(
    level === 1 ? snailBeaten : "Curious Kitten, Level 2 of 8",
  );
  expect(await beatenOnScreen(page)).toEqual([snailBeaten]);

  const suggestion = (await (
    await page.request.get(`/api/profiles/${profile.id}/suggestion`)
  ).json()) as LevelSuggestion | null;
  expect(suggestion).toBeNull();
}

test("suggests the next level after three wins, and Try it moves up", async ({
  page,
}) => {
  const profile = await createProfile(page, uniqueName("Climber"));
  await earnLevelUp(page, profile);
  await page.getByRole("button", { name: "Try it" }).click();
  await expectAnswered(page, profile, 2);
  await expect(page.locator('.pp-hello p[aria-live="polite"]')).toHaveText(
    "Likes to grab pieces and sometimes forgets to guard its own.",
  );

  await page.goto("/");
  await openSetup(page, profile);
  await expectAnswered(page, profile, 2);
});

test("suggests the next level after three wins, and Stay here keeps the level", async ({
  page,
}) => {
  const profile = await createProfile(page, uniqueName("Stayer"));
  await earnLevelUp(page, profile);
  await page.getByRole("button", { name: "Stay here" }).click();
  await expectAnswered(page, profile, 1);
  await expect(page.locator('.pp-hello p[aria-live="polite"]')).toHaveText(
    "Plenty of chances to practice your first moves.",
  );

  await page.goto("/");
  await openSetup(page, profile);
  await expectAnswered(page, profile, 1);
});
