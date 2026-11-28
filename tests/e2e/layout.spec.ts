import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ReplayRecording } from "../../src/web/engine/replayTransport.js";
import {
  createProfile,
  openDevFen,
  pickProfile,
  playMove,
  startAs,
  uniqueName,
} from "./helpers.js";
import { loadDetectorFixture, recordingFor } from "./replay.js";

const desktop = { width: 1280, height: 800 };
const portrait = { width: 768, height: 1024 };
const landscape = { width: 1024, height: 768 };
// A small portrait tablet, narrower than the board target.
const narrow = { width: 600, height: 900 };

// Reads a design token from the running app.
function token(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    name,
  );
}

// The browser's computed form of a value, so a token read at runtime compares
// with the computed style of an element that uses it.
function computedAs(page: Page, property: string, value: string) {
  return page.evaluate(
    ([property, value]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(property, value);
      document.body.append(probe);
      const result = getComputedStyle(probe).getPropertyValue(property);
      probe.remove();
      return result;
    },
    [property, value] as const,
  );
}

function style(locator: Locator, property: string, pseudo?: string) {
  return locator.evaluate(
    (element, [property, pseudo]) =>
      getComputedStyle(element, pseudo).getPropertyValue(property),
    [property, pseudo] as const,
  );
}

async function box(locator: Locator) {
  const measured = await locator.boundingBox();
  expect(measured, "the element is rendered").not.toBeNull();
  return measured!;
}

function trackWidths(locator: Locator) {
  return style(locator, "grid-template-columns").then((tracks) =>
    tracks.split(" ").map(parseFloat),
  );
}

// [red, green, blue] in 0-255 and alpha in 0-1, from rgb() or color(srgb).
function channels(color: string) {
  const srgb =
    /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color);
  if (srgb)
    return {
      rgb: srgb.slice(1, 4).map((value) => Math.round(Number(value) * 255)),
      alpha: Number(srgb[4] ?? 1),
    };
  const rgb = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(color);
  if (!rgb) throw new Error(`Unexpected color ${color}`);
  return { rgb: rgb.slice(1, 4).map(Number), alpha: Number(rgb[4] ?? 1) };
}

function square(page: Page, name: string) {
  return page.locator(`.pp-board [data-square="${name}"] .pp-sq`);
}

test("sizes piece images on the board, the color tiles and the promotion buttons", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await page.goto("/");
  await page.getByRole("button", { name: "Play as guest" }).click();
  const colorPieces = page
    .getByRole("group", { name: "Which side do you want?" })
    .locator("img");
  await expect(colorPieces.first()).toBeVisible();
  for (const piece of await colorPieces.all())
    expect(await box(piece)).toMatchObject({ width: 48, height: 48 });

  await page.getByRole("button", { name: "White", exact: true }).click();
  await page.getByRole("button", { name: "Play!" }).click();
  const pieces = page.locator(".pp-board [data-piece]");
  await expect(pieces).toHaveCount(32);
  const ratios = await pieces.evaluateAll((wrappers) =>
    wrappers.map((wrapper) => {
      const square = wrapper.closest(".pp-sq")!.getBoundingClientRect();
      const image = wrapper.querySelector(":scope > img")!;
      const { width, height } = image.getBoundingClientRect();
      return [width / square.width, height / square.height];
    }),
  );
  for (const [width, height] of ratios) {
    expect(width, "the image is 92% of its square").toBeCloseTo(0.92, 2);
    expect(height).toBeCloseTo(0.92, 2);
  }

  await openDevFen(page, "7k/4P3/8/8/8/8/8/K7 w - - 0 1");
  await playMove(page, "e7e8");
  const picker = page.getByRole("dialog", {
    name: "Choose a piece to promote to",
  });
  const choices = picker.locator("img");
  await expect(choices).toHaveCount(4);
  for (const choice of await choices.all())
    expect(await box(choice)).toMatchObject({ width: 40, height: 40 });

  const backdrop = channels(
    await style(page.locator(".pp-promotion-backdrop"), "background-color"),
  );
  const ink = channels(
    await computedAs(page, "color", await token(page, "--pp-ink")),
  );
  expect(backdrop.rgb, "the backdrop is tinted with the ink token").toEqual(
    ink.rgb,
  );
  expect(
    backdrop.alpha,
    "the board shows through the backdrop",
  ).toBeGreaterThan(0);
  expect(backdrop.alpha).toBeLessThan(1);
});

test("draws move highlights under the pieces and move markers over them", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  // White's only legal move is f7+, so the computer checks the kid's king.
  await openDevFen(page, "1r4k1/8/5P2/8/8/n7/P7/K7 w - - 0 1", "b");
  await expect(square(page, "g8")).toHaveClass(/\bis-check\b/, {
    timeout: 10_000,
  });

  const king = square(page, "g8");
  expect(
    await king.evaluate((element) => ({
      square: getComputedStyle(element).position,
      highlight: getComputedStyle(element, "::before").zIndex,
      piece: getComputedStyle(element.querySelector("[data-piece]")!).zIndex,
    })),
  ).toEqual({ square: "relative", highlight: "1", piece: "2" });

  const lastMove = await computedAs(
    page,
    "background-color",
    await token(page, "--pp-hl-last"),
  );
  for (const name of ["f6", "f7"]) {
    await expect(square(page, name)).toHaveClass(/\bis-last\b/);
    expect(
      await style(square(page, name), "background-color", "::before"),
    ).toBe(lastMove);
  }
  expect(await style(king, "background-image", "::before")).toBe(
    await computedAs(
      page,
      "background-image",
      await token(page, "--pp-hl-check"),
    ),
  );

  await page.locator('.pp-board [data-square="b8"]').click();
  await expect(square(page, "b8")).toHaveClass(/\bis-selected\b/);
  expect(await style(square(page, "b8"), "background-color", "::before")).toBe(
    await computedAs(
      page,
      "background-color",
      await token(page, "--pp-hl-selected"),
    ),
  );

  await page.locator('.pp-board [data-square="g8"]').click();
  await expect(page.locator(".pp-sq.has-capture")).toHaveCount(1);
  const markers = await page
    .locator(".pp-board .pp-sq.has-dot, .pp-board .pp-sq.has-capture")
    .evaluateAll((squares) =>
      squares
        .map((element) => [
          element.closest("[data-square]")!.getAttribute("data-square"),
          element.classList.contains("has-capture") ? "capture" : "dot",
          getComputedStyle(element, "::after").zIndex,
        ])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    );
  expect(markers).toEqual([
    ["f7", "capture", "3"],
    ["f8", "dot", "3"],
    ["g7", "dot", "3"],
    ["h7", "dot", "3"],
    ["h8", "dot", "3"],
  ]);
});

test("keeps the coach region 240px tall and the Hint button at the end of the kid's row", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAs(page);
  const coach = page.locator(".pp-game__coach");
  await expect(coach.locator(".pp-coach__pip")).toBeVisible();
  expect(await style(coach, "min-height")).toBe("240px");
  expect((await box(coach)).height, "Pip alone is shorter than 240px").toBe(
    240,
  );

  const hint = page.getByRole("button", { name: "Hint", exact: true });
  const row = await box(hint.locator(".."));
  const button = await box(hint);
  expect(button.x + button.width, "Hint ends the kid's row").toBeCloseTo(
    row.x + row.width,
    1,
  );
});

for (const viewport of [desktop, portrait]) {
  test(`sizes the danger badge from the board at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const fixture = loadDetectorFixture("hanging-piece-7");
    await page.addInitScript((replay: ReplayRecording) => {
      (
        window as Window & { __pawnpalReplay?: ReplayRecording }
      ).__pawnpalReplay = replay;
    }, recordingFor(fixture));
    await openDevFen(page, fixture.fen, fixture.kidColor, { replay: true });
    await playMove(page, fixture.move);
    const badge = square(page, "g3").locator(".pp-sq__badge");
    await expect(badge).toHaveText("!", { timeout: 8_000 });

    const board = page.locator(".pp-board");
    expect(await style(board, "container-type")).toBe("inline-size");
    expect(await style(square(page, "g3"), "--board")).toBe("100cqi");
    const { width } = await box(board);
    expect(
      parseFloat(await style(badge, "font-size")),
      "the badge text scales with the board",
    ).toBeCloseTo((width / 8) * 0.24, 1);
  });
}

test("gives the board column 576px on a desktop and its grid track in landscape", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAs(page);
  const column = page.locator(".pp-game__board-column");
  const board = page.locator(".pp-board");
  const layout = page.locator(".pp-game__layout");
  const [track] = await trackWidths(layout);
  expect(track, "the grid track is wider than the column").toBeGreaterThan(576);
  expect((await box(column)).width).toBe(576);
  expect((await box(board)).width, "the board fills its column").toBe(576);

  await page.setViewportSize(landscape);
  const [narrowTrack] = await trackWidths(layout);
  expect(narrowTrack, "the track is narrower than 576px").toBeLessThan(576);
  expect((await box(column)).width).toBeCloseTo(narrowTrack!, 1);
  expect((await box(board)).width).toBeCloseTo(narrowTrack!, 1);
});

test("stacks the game in one column as wide as the board target in portrait", async ({
  page,
}) => {
  await page.setViewportSize(portrait);
  await startAs(page);
  const layout = page.locator(".pp-game__layout");
  const column = page.locator(".pp-game__board-column");
  const side = page.locator(".pp-game__side-column");
  const target = parseFloat(await token(page, "--pp-board-target"));

  const tracks = await trackWidths(layout);
  expect(tracks, "one column").toHaveLength(1);
  expect(tracks[0], "the track is wider than the target").toBeGreaterThan(
    target,
  );
  const columnBox = await box(column);
  const sideBox = await box(side);
  expect(columnBox.width).toBe(target);
  expect(sideBox.width).toBe(target);
  expect(sideBox.y, "the coach sits under the board").toBeGreaterThanOrEqual(
    columnBox.y + columnBox.height,
  );

  await page.setViewportSize(narrow);
  const [narrowTrack] = await trackWidths(layout);
  expect(narrowTrack, "the track is narrower than the target").toBeLessThan(
    target,
  );
  expect((await box(column)).width, "the column fills the track").toBeCloseTo(
    narrowTrack!,
    1,
  );
});

test("keeps the live announcement for screen readers in a 1px box", async ({
  page,
}) => {
  await page.setViewportSize(desktop);
  await startAs(page);
  await playMove(page, "e2e4");
  const live = page.locator('.pp-game__live[aria-live="polite"]');
  await expect(live).toHaveText(/\S/);
  expect(await box(live)).toMatchObject({ width: 1, height: 1 });
  expect(
    await live.evaluate((element) => {
      const { position, overflow, clip } = getComputedStyle(element);
      return { position, overflow, clip };
    }),
  ).toEqual({
    position: "absolute",
    overflow: "hidden",
    clip: "rect(0px, 0px, 0px, 0px)",
  });
});

for (const viewport of [desktop, landscape]) {
  test(`centers the game title and sizes Home to its content at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startAs(page);
    const topbar = page.locator(".pp-game__topbar");
    const title = page.getByRole("heading", { level: 1, name: "Game time" });
    const bar = await box(topbar);
    const [left, middle, right] = await trackWidths(topbar);
    expect(left, "the side columns share the free width").toBeCloseTo(
      right!,
      0,
    );

    const heading = await box(title);
    expect(
      heading.x + heading.width / 2,
      "the title sits in the middle of the bar",
    ).toBeCloseTo(bar.x + bar.width / 2, 0);
    expect(heading.width).toBeLessThanOrEqual(middle! + 0.5);
    expect(await style(title, "font-size")).toBe(
      await computedAs(page, "font-size", await token(page, "--pp-text-xl")),
    );

    const home = await box(page.getByRole("button", { name: "Home" }));
    expect(home.x, "Home starts the bar").toBeCloseTo(bar.x, 1);
    expect(home.width, "Home is as wide as its content").toBeLessThan(left!);

    const giveUp = await box(
      page.getByRole("button", { name: "Give up", exact: true }),
    );
    expect(giveUp.x + giveUp.width, "Give up ends the bar").toBeCloseTo(
      bar.x + bar.width,
      1,
    );
  });
}

test("spaces the profile card and sizes its title from the kit's tokens", async ({
  page,
}) => {
  const profile = await createProfile(page, uniqueName("Token kid"));
  await page.setViewportSize(desktop);
  await pickProfile(page, profile.name);
  await page.getByRole("button", { name: "Game history" }).click();
  const title = page.getByRole("heading", {
    level: 1,
    name: `${profile.name}'s games`,
  });
  await expect(title).toBeVisible();
  const card = page.locator(".pp-setup__card");
  const space = await computedAs(
    page,
    "row-gap",
    await token(page, "--pp-space-6"),
  );
  expect(await style(card, "row-gap")).toBe(space);
  expect(await style(card, "column-gap")).toBe(space);

  const fontSize = async () => parseFloat(await style(title, "font-size"));
  const smallest = parseFloat(await token(page, "--pp-text-2xl"));
  const largest = parseFloat(await token(page, "--pp-text-3xl"));
  expect(await fontSize(), "capped at the largest size").toBe(largest);
  await page.setViewportSize(portrait);
  expect(await fontSize(), "6% of the window width").toBeCloseTo(
    portrait.width * 0.06,
    2,
  );
  expect(await fontSize()).toBeGreaterThan(smallest);
  expect(await fontSize()).toBeLessThan(largest);
  await page.setViewportSize(narrow);
  expect(await fontSize(), "never below the smaller size").toBe(smallest);
});
