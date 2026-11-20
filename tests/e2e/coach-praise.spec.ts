import { expect, test } from "@playwright/test";
import {
  expectReplyWithinFiveSeconds,
  makeAnyLegalMove,
  openDevFen,
} from "./helpers.js";

test("praises the only move and stays quiet on ordinary moves", async ({
  page,
}) => {
  // `played-fork-1` records a large gap between `Ng7+` and the alternatives.
  await openDevFen(page, "4k3/8/4q3/5N2/8/8/P7/K7 w - - 0 1", "w");
  const board = page.locator(".pp-board");
  await expect(board).toBeVisible();
  await board.locator('[data-square="f5"]').click();
  await board.locator('[data-square="g7"]').click();

  await expect(page.locator(".pp-grade--great")).toBeVisible({
    timeout: 8_000,
  });
  await expect(
    page.locator('.pp-bubble__text[data-mode="praise"]'),
  ).toBeVisible();
  await expectReplyWithinFiveSeconds(page, 0);

  await makeAnyLegalMove(page, "w");
  await expectReplyWithinFiveSeconds(page, 2);
  await makeAnyLegalMove(page, "w");
  await expectReplyWithinFiveSeconds(page, 4);
  await expect(page.locator(".pp-bubble__text")).toHaveCount(0);
});
