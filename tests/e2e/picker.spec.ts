import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createProfile, uniqueName } from "./helpers.js";

test("shows profiles and the guest as big tiles and parent settings as a corner gear", async ({
  page,
}) => {
  const viewport = { width: 1280, height: 800 };
  await page.setViewportSize(viewport);
  const profile = await createProfile(page, uniqueName("Tile kid"));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Who's playing?" }),
  ).toBeVisible();

  const tiles = page.locator(".pp-picker__tiles");
  for (const tile of [
    tiles.getByRole("button", { name: profile.name, exact: true }),
    tiles.getByRole("button", { name: "Play as guest", exact: true }),
  ]) {
    const box = (await tile.boundingBox())!;
    expect(box.width, "tile width").toBeGreaterThanOrEqual(160);
    expect(box.height, "tile height").toBeGreaterThanOrEqual(160);
  }

  const gear = page.getByRole("button", {
    name: "Parent settings",
    exact: true,
  });
  await expect(
    tiles.getByRole("button", { name: "Parent settings" }),
  ).toHaveCount(0);
  const corner = (await gear.boundingBox())!;
  expect(corner.y, "distance from the top").toBeLessThan(48);
  expect(
    viewport.width - (corner.x + corner.width),
    "distance from the right edge",
  ).toBeLessThan(48);
  expect(corner.width, "gear width").toBeLessThan(80);

  await gear.click();
  await expect(
    page.getByRole("heading", { name: "Parent settings" }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
]) {
  test(`keeps a long unbroken name inside its tile at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    // Sixty characters, the longest name a profile accepts, with no spaces.
    const suffix = randomUUID().replaceAll("-", "");
    const name = `Maximilianalexanderchristopher${suffix}`.slice(0, 60);
    await createProfile(page, name);
    await page.goto("/");

    const tile = page
      .locator(".pp-picker__tiles")
      .getByRole("button", { name, exact: true });
    // Other tests' profiles can push the tile below the fold. Centre it, so a
    // tile cut off by a fraction of a pixel at the edge can't fail the check.
    await tile.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(tile).toBeInViewport({ ratio: 1 });
    const label = tile.getByText(name, { exact: true });
    const [tileBox, labelBox] = [
      (await tile.boundingBox())!,
      (await label.boundingBox())!,
    ];
    expect(tileBox.x).toBeGreaterThanOrEqual(0);
    expect(tileBox.x + tileBox.width).toBeLessThanOrEqual(viewport.width);
    expect(labelBox.x).toBeGreaterThanOrEqual(tileBox.x);
    expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(
      tileBox.x + tileBox.width,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "the picker doesn't scroll sideways",
    ).toBe(true);
  });
}
