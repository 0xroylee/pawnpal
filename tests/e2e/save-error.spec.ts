import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  createProfile,
  expectOnFirstScreen,
  mateInOneFen,
  pickProfile,
  playMove,
  seedGame,
  startServer,
  stopServer,
  uniqueName,
} from "./helpers.js";

async function expectCenteredUnderCard(page: Page, parts: Locator[]) {
  const card = (await page.locator(".pp-result__card").boundingBox())!;
  const boxes = await Promise.all(
    parts.map(async (part) => (await part.boundingBox())!),
  );
  for (const box of boxes)
    expect(box.y, "it sits under the card").toBeGreaterThanOrEqual(
      card.y + card.height,
    );
  const left = Math.min(...boxes.map(({ x }) => x));
  const right = Math.max(...boxes.map(({ x, width }) => x + width));
  expect(
    Math.abs((left + right) / 2 - (card.x + card.width / 2)),
    "it is centered under the card",
  ).toBeLessThanOrEqual(2);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
]) {
  test(`shows the save error under the result card and saves on Try again at ${viewport.width}×${viewport.height}`, async ({
    browser,
  }) => {
    const home = await mkdtemp(join(tmpdir(), "pawnpal-save-error-"));
    let server: Awaited<ReturnType<typeof startServer>> | undefined;
    let context: BrowserContext | undefined;
    try {
      server = await startServer(home);
      const url = server.url;
      context = await browser.newContext({ baseURL: url, viewport });
      const page = await context.newPage();
      const profile = await createProfile(page, uniqueName("Offline kid"));
      await seedGame(page, profile.id, { fen: mateInOneFen });
      await pickProfile(page, profile.name);
      await page.getByRole("button", { name: "Continue game" }).click();
      await expect(
        page.getByRole("button", { name: "Hint", exact: true }),
      ).toBeEnabled();

      await stopServer(server.child, "SIGTERM");
      await playMove(page, "a1a8");
      await expect(
        page.getByRole("heading", { name: "You win by checkmate!" }),
      ).toBeVisible();
      const error = page
        .getByRole("status")
        .filter({ hasText: "Couldn't save the game" });
      const retry = page.getByRole("button", {
        name: "Try again",
        exact: true,
      });
      await expect(error).toBeVisible();
      await expect(retry).toBeVisible();
      await expectOnFirstScreen(page, [error, retry]);
      await expectCenteredUnderCard(page, [error, retry]);

      server = await startServer(home, new URL(url).port);
      expect(server.url, "the server is back at the same address").toBe(url);
      await retry.click();
      const saved = page.getByRole("status").filter({ hasText: "Game saved" });
      await expect(saved).toBeVisible();
      await expect(retry).toHaveCount(0);
      await expect(
        page.locator('ul[aria-live="polite"]').getByRole("listitem"),
      ).toHaveText([
        "New badge! First game",
        "New badge! First win",
        "New badge! First checkmate",
      ]);

      await page.getByRole("button", { name: "Home" }).click();
      await page
        .getByRole("button", { name: profile.name, exact: true })
        .click();
      await page.getByRole("button", { name: "Game history" }).click();
      await expect(
        page.getByRole("heading", { name: `${profile.name}'s games` }),
      ).toBeVisible();
      await expect(page.getByText("Won", { exact: true })).toBeVisible();
    } finally {
      await context?.close();
      if (server) await stopServer(server.child, "SIGTERM");
      await rm(home, { recursive: true, force: true });
    }
  });
}
