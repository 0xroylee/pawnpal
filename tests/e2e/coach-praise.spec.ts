import { expect, test } from "@playwright/test";
import { expectReplyWithinFiveSeconds, openDevFen } from "./helpers.js";
import { loadDetectorFixture, recordingFor } from "./replay.js";

test("praises the only move and stays quiet on an ordinary move", async ({
  page,
}) => {
  const fork = loadDetectorFixture("played-fork-1");
  const quiet = loadDetectorFixture("quiet-pawns-3");
  await page.addInitScript(
    (recording) => {
      globalThis.__pawnpalReplay = recording;
    },
    {
      positions: [
        ...recordingFor(fork).positions,
        ...recordingFor(quiet).positions,
      ],
    },
  );

  const board = page.locator(".pp-board");
  const bubble = page.locator(".pp-bubble__text");
  const play = async (fixture: typeof fork) => {
    await openDevFen(page, fixture.fen, fixture.kidColor, { replay: true });
    await board.locator(`[data-square="${fixture.move.slice(0, 2)}"]`).click();
    await board.locator(`[data-square="${fixture.move.slice(2, 4)}"]`).click();
  };

  await play(fork);
  await expect(page.locator(".pp-grade--great")).toBeVisible();
  await expect(bubble).toHaveAttribute("data-mode", "praise");
  await expectReplyWithinFiveSeconds(page, 0);

  await play(quiet);
  await expectReplyWithinFiveSeconds(page, 0);
  await expect(page.getByTestId("debug-grade")).toBeVisible();
  await expect(bubble).toHaveCount(0);
});
