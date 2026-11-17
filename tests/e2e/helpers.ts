import { expect, type Page } from "@playwright/test";

export async function startAs(page: Page, color: "White" | "Black" = "White") {
  await page.goto("/");
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
      return;
    }
  }
  throw new Error(`No legal move was available for ${color}`);
}

export async function expectReplyWithinFiveSeconds(
  page: Page,
  previousMoves: number,
) {
  await expect
    .poll(async () => page.getByTestId("move").count(), { timeout: 5_000 })
    .toBe(previousMoves + 2);
}

export async function openDevFen(page: Page, fen: string, color?: "w" | "b") {
  const params = new URLSearchParams({ fen });
  if (color) params.set("color", color);
  await page.goto(`/?${params.toString()}`);
}
