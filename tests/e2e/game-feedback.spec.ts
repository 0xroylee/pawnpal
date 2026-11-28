import { expect, test, type Page } from "@playwright/test";
import type { ReplayRecording } from "../../src/web/engine/replayTransport.js";
import {
  expectOnFirstScreen,
  openDevFen,
  openMissedFork,
  playMove,
} from "./helpers.js";
import { loadDetectorFixture, recordingFor } from "./replay.js";

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

const portrait = { width: 768, height: 1024 };

// Replays a recorded mistake on a portrait tablet. Safari on an iPad has an
// English voice, so the panel carries Pip's voice button; give every browser
// one so the test sees that taller panel. Pip picks one wording per game with
// Math.random, so pin it to the second variant.
async function playRecordedMistake(page: Page, id: string) {
  const fixture = loadDetectorFixture(id);
  await page.setViewportSize(portrait);
  await page.addInitScript((replay: ReplayRecording) => {
    globalThis.__pawnpalReplay = replay;
    Math.random = () => 0.9;
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(readonly text: string) {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [{ lang: "en-US", localService: true }],
        cancel() {},
        speak() {},
        addEventListener() {},
        removeEventListener() {},
      },
    });
  }, recordingFor(fixture));
  await openDevFen(page, fixture.fen, fixture.kidColor, { replay: true });
  await expect(page.locator(".pp-board")).toBeVisible();
  await playMove(page, fixture.move);
}

async function expectPanelOnFirstScreen(
  page: Page,
  mode: "nudge" | "reveal",
  text: string,
  actions: string[],
) {
  const panel = page.locator(`.pp-feedback[data-mode="${mode}"]`);
  await expect(panel.getByTestId("coach-text")).toHaveText(text);
  // Measure the panel at rest. Playwright's scroll-into-view before a click
  // also jumps to the page bottom while the panel still slides in.
  await panel.evaluate((element) =>
    Promise.all(element.getAnimations().map(({ finished }) => finished)),
  );
  await expect(
    panel.locator(".pp-feedback__actions").getByRole("button"),
  ).toHaveText(actions);
  await expect(
    panel.getByRole("button", { name: "Turn on Pip's voice" }),
  ).toBeVisible();
  const buttons = await panel.getByRole("button").all();
  await expectOnFirstScreen(page, [
    panel.getByTestId("coach-text"),
    ...buttons,
  ]);
  await expectOpponentInTopBar(page);
}

// The top bar shows the opponent where the title was. The name reaches
// assistive tech once, and the page keeps its heading.
async function expectOpponentInTopBar(page: Page) {
  const topbar = page.locator(".pp-game__topbar");
  const name = topbar.getByText("Computer", { exact: true });
  await expect(name).toBeInViewport({ ratio: 1 });
  const bar = (await topbar.boundingBox())!;
  const opponent = (await name.locator("..").boundingBox())!;
  expect(
    Math.abs(opponent.x + opponent.width / 2 - (bar.x + bar.width / 2)),
    "the opponent sits in the middle of the top bar",
  ).toBeLessThanOrEqual(2);
  await expectNamedOnce(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Game time" }),
  ).toHaveCount(1);
  expect(
    (await page.getByRole("heading", { name: "Game time" }).boundingBox())!
      .width,
    "the title gives its place to the opponent",
  ).toBeLessThanOrEqual(1);
}

async function expectNamedOnce(page: Page) {
  const tree = await page.locator("main").ariaSnapshot();
  expect(tree.match(/\bComputer\b/g), tree).toHaveLength(1);
}

test("keeps a hanging-piece nudge and reveal on screen in portrait at 768×1024", async ({
  page,
}) => {
  await playRecordedMistake(page, "hanging-piece-1");
  await expectPanelOnFirstScreen(
    page,
    "nudge",
    "Look at what can reach your rook.",
    ["Keep my move", "Show me", "Try again"],
  );
  await page.getByRole("button", { name: "Show me" }).click();
  await expectPanelOnFirstScreen(
    page,
    "reveal",
    "Your rook was left open to capture by the opponent's rook. Get your rook out of danger.",
    ["OK"],
  );
});

// At 125 characters, this is the longest reveal any recorded fixture reaches.
test("keeps the longest reveal on screen in portrait at 768×1024", async ({
  page,
}) => {
  await playRecordedMistake(page, "missed-fork-nonchecking-1");
  await expectPanelOnFirstScreen(
    page,
    "nudge",
    "Look at what can reach your queen.",
    ["Keep my move", "Show me", "Try again"],
  );
  await page.getByRole("button", { name: "Show me" }).click();
  await expectPanelOnFirstScreen(
    page,
    "reveal",
    "Your queen was left open to capture by the opponent's queen. Use your knight to protect your queen from the opponent's queen.",
    ["OK"],
  );
  const text = page.getByTestId("coach-text");
  expect(
    await text.evaluate((element) => getComputedStyle(element).fontSize),
    "the coach text keeps its size",
  ).toBe("24px");
});

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
]) {
  test(`keeps the title in the top bar and the opponent above the board at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openMissedFork(page);
    const title = page.getByRole("heading", { level: 1, name: "Game time" });
    await expect(title).toBeInViewport({ ratio: 1 });
    expect((await title.boundingBox())!.width).toBeGreaterThan(100);
    const opponent = (await page
      .getByText("Computer", { exact: true })
      .filter({ visible: true })
      .boundingBox())!;
    const board = (await page.locator(".pp-board").boundingBox())!;
    expect(opponent.y + opponent.height).toBeLessThanOrEqual(board.y);
    await expectNamedOnce(page);
  });
}
