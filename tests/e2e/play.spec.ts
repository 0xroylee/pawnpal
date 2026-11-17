import { expect, test } from "@playwright/test";
import {
  expectReplyWithinFiveSeconds,
  makeAnyLegalMove,
  startAs,
} from "./helpers.js";

test("plays five moves by tapping legal squares and gets a quick reply", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await startAs(page, "White");

  for (let move = 0; move < 5; move += 1) {
    const previousMoves = await page.getByTestId("move").count();
    await makeAnyLegalMove(page, "w");
    await expectReplyWithinFiveSeconds(page, previousMoves);
  }

  await expect(page.getByTestId("move")).toHaveCount(10);
});
