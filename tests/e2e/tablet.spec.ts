import { expect, test, type Page } from "@playwright/test";
import { expectReplyWithinFiveSeconds, startAs } from "./helpers.js";

for (const viewport of [
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
]) {
  test(`lays out the board and coach at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startAs(page);
    const board = page.locator(".pp-board");
    await expect(board).toHaveAttribute("data-engine-build", "lite-single");
    const boardBox = await board.boundingBox();
    const panelBox = await page.locator(".pp-game__side-column").boundingBox();
    if (viewport.width < viewport.height)
      expect(panelBox!.y).toBeGreaterThan(boardBox!.y + boardBox!.height);
    else expect(panelBox!.x).toBeGreaterThan(boardBox!.x + boardBox!.width);
    await expect(page).toHaveScreenshot(`tablet-${viewport.width}.png`, {
      animations: "disabled",
      maxDiffPixelRatio: 0.025,
    });
  });
}

test("plays by touch tap and drag without scrolling the tablet board", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await startAs(page);
  const board = page.locator(".pp-board");
  await expect(board).toHaveCSS("touch-action", "none");
  await board.locator('[data-square="e2"]').tap();
  await board.locator('[data-square="e4"]').tap();
  await expect(page.getByTestId("move").first()).toContainText("e4");
  await expectReplyWithinFiveSeconds(page, 0);
  const source = board.locator('[data-square="g1"] [data-piece="wN"]');
  const target = board.locator('[data-square="f3"]');
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  await touchDrag(page, from!, to!);
  await expect(page.getByTestId("move").nth(2)).toContainText("Nf3");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

async function touchDrag(
  page: Page,
  from: { x: number; y: number; width: number; height: number },
  to: typeof from,
) {
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.evaluate(
    async ({ start, end }) => {
      const target = document.elementFromPoint(start.x, start.y);
      if (!target) throw new Error("Could not find the touched piece");
      const emit = (type: string, clientX: number, clientY: number) => {
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 1,
            isPrimary: true,
            pointerType: "touch",
            button: 0,
            buttons: type === "pointerup" ? 0 : 1,
            clientX,
            clientY,
          }),
        );
      };
      emit("pointerdown", start.x, start.y);
      for (let step = 1; step <= 6; step++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        emit(
          "pointermove",
          start.x + ((end.x - start.x) * step) / 6,
          start.y + ((end.y - start.y) * step) / 6,
        );
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      emit("pointerup", end.x, end.y);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    },
    { start, end },
  );
}
