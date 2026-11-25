import { expect, type Page } from "@playwright/test";
import type { Difficulty } from "../../src/shared/game/difficulty.js";

export async function startAs(page: Page, color: "White" | "Black" = "White") {
  await page.goto("/");
  await page.getByRole("button", { name: "Play as guest" }).click();
  await page.getByRole("button", { name: color, exact: true }).click();
  await page.getByRole("button", { name: "Play!" }).click();
  await expect(page.locator(".pp-board")).toBeVisible();
}

export async function makeAnyLegalMove(page: Page, color: "w" | "b") {
  const board = page.locator(".pp-board");
  const pieceSquares = await board
    .locator(`[data-piece^="${color}"]`)
    .evaluateAll((pieces) =>
      [
        ...new Set(
          pieces.map((piece) =>
            piece.closest("[data-square]")?.getAttribute("data-square"),
          ),
        ),
      ].filter((square): square is string => Boolean(square)),
    );

  for (const square of pieceSquares) {
    await board.locator(`[data-square="${square}"]`).click();
    const targets = board.locator(".pp-sq.has-dot, .pp-sq.has-capture");
    if ((await targets.count()) === 0) continue;

    const target = await targets
      .first()
      .evaluate(
        (element) =>
          element.closest("[data-square]")?.getAttribute("data-square") ?? null,
      );
    if (target) {
      await board.locator(`[data-square="${target}"]`).click();
      const promotion = page.getByRole("dialog", {
        name: "Choose a piece to promote to",
      });
      if (await promotion.isVisible()) {
        await promotion.getByRole("button", { name: "Queen" }).click();
      }
      return;
    }
  }
  throw new Error(`No legal move was available for ${color}`);
}

export async function expectReplyWithinFiveSeconds(
  page: Page,
  previousMoves: number,
) {
  const keepMove = page.getByRole("button", {
    name: "Keep my move",
    exact: true,
  });
  let released = false;
  await expect
    .poll(
      async () => {
        if (!released && (await keepMove.isVisible())) {
          released = true;
          await keepMove.click();
        }
        return page.getByTestId("move").count();
      },
      { timeout: 5_000 },
    )
    .toBe(previousMoves + 2);
}

export async function openDevFen(
  page: Page,
  fen: string,
  color?: "w" | "b",
  options: {
    replay?: boolean;
    offerTryAgain?: boolean;
    level?: Difficulty;
  } = {},
) {
  const params = new URLSearchParams({ fen });
  if (color) params.set("color", color);
  if (options.replay) params.set("analyst", "replay");
  if (options.offerTryAgain === false) params.set("tryAgain", "off");
  if (options.level !== undefined) params.set("level", String(options.level));
  await page.goto(`/?${params.toString()}`);
}
