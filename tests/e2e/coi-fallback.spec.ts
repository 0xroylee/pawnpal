import { expect, test } from "@playwright/test";
import {
  expectReplyWithinFiveSeconds,
  makeAnyLegalMove,
  startAs,
} from "./helpers.js";

test("uses single-threaded Stockfish when cross-origin isolation is disabled", async ({
  page,
}) => {
  await startAs(page, "White");
  await expect(page.evaluate(() => crossOriginIsolated)).resolves.toBe(false);
  await expect(page.locator(".pp-board")).toHaveAttribute(
    "data-engine-build",
    "lite-single",
  );

  await makeAnyLegalMove(page, "w");
  await expectReplyWithinFiveSeconds(page, 0);
});
