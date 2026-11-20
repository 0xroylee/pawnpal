import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { BoardArrow } from "../../src/web/coach/annotations.js";
import type { ReplayRecording } from "../../src/web/engine/replayTransport.js";
import { expectReplyWithinFiveSeconds, openDevFen } from "./helpers.js";
import { loadDetectorFixture, recordingFor } from "./replay.js";

type DetectorPosition = {
  kind: string;
  fixture: string;
  mode: "explain";
  dangerSquares: string[];
  arrows: BoardArrow[];
  pieceWords: { explain: string[]; reveal: string[] };
  debugOnly?: boolean;
};

const positions = JSON.parse(
  readFileSync(
    new URL("../fixtures/coach/e2e-detectors.json", import.meta.url),
    "utf8",
  ),
) as DetectorPosition[];

for (const position of positions) {
  test(`replays ${position.kind} from ${position.fixture}`, async ({
    page,
  }) => {
    const fixture = loadDetectorFixture(position.fixture);
    const recording = recordingFor(fixture);
    await page.addInitScript((replay: ReplayRecording) => {
      (
        window as Window & { __pawnpalReplay?: ReplayRecording }
      ).__pawnpalReplay = replay;
    }, recording);
    await openDevFen(page, fixture.fen, fixture.kidColor, { replay: true });

    const board = page.locator(".pp-board");
    await expect(board).toBeVisible();
    await board.locator(`[data-square="${fixture.move.slice(0, 2)}"]`).click();
    await board.locator(`[data-square="${fixture.move.slice(2, 4)}"]`).click();

    if (position.debugOnly) {
      await expect(
        page.locator(
          `.pp-debug-panel__facts [data-fact-kind="${position.kind}"]`,
        ),
      ).toBeVisible({ timeout: 8_000 });
      await expect(page.locator(".pp-grade--great")).toBeVisible();
      await expect(
        page.locator('.pp-bubble__text[data-mode="praise"]'),
      ).toBeVisible();
      await expectAnnotations(page, position);
      await expectReplyWithinFiveSeconds(page, 0);
      await expectNoAnnotations(page);
      return;
    }

    const message = page.locator(
      `.pp-bubble__text[data-fact-kind="${position.kind}"]`,
    );
    await expect(message).toBeVisible({ timeout: 8_000 });
    await expect(message).toHaveAttribute("data-mode", position.mode);
    const text = await message.innerText();
    for (const word of position.pieceWords.explain) {
      expect(text.toLowerCase()).toContain(word);
    }
    expect(text).not.toMatch(/\b[a-h][1-8]\b/);
    await expect(page.getByTestId("move")).toHaveCount(1);
    await expectAnnotations(page, position);

    await page.getByRole("button", { name: "OK", exact: true }).click();
    await expect(page.getByTestId("move")).toHaveCount(2, { timeout: 5_000 });
    await expectNoAnnotations(page);
  });
}

async function expectAnnotations(
  page: Page,
  position: DetectorPosition,
): Promise<void> {
  const dangerSquares = await page
    .locator(".pp-board [data-square]")
    .evaluateAll((squares) =>
      squares
        .filter((square) => square.querySelector(".pp-sq.is-danger"))
        .map((square) => square.getAttribute("data-square"))
        .filter((square): square is string => square !== null)
        .sort(),
    );
  const arrows = await page
    .locator(".pp-board [data-arrow-kind]")
    .evaluateAll((elements) =>
      elements
        .map((element) => ({
          kind: element.getAttribute("data-arrow-kind"),
          from: element.getAttribute("data-arrow-from"),
          to: element.getAttribute("data-arrow-to"),
        }))
        .sort((left, right) =>
          `${left.kind}:${left.from}:${left.to}`.localeCompare(
            `${right.kind}:${right.from}:${right.to}`,
          ),
        ),
    );

  expect(dangerSquares, `${position.fixture} danger squares`).toEqual(
    [...position.dangerSquares].sort(),
  );
  expect(arrows, `${position.fixture} arrow endpoints`).toEqual(
    position.arrows
      .map((arrow) => ({
        kind: arrow.kind,
        from: arrow.from,
        to: arrow.to,
      }))
      .sort((left, right) =>
        `${left.kind}:${left.from}:${left.to}`.localeCompare(
          `${right.kind}:${right.from}:${right.to}`,
        ),
      ),
  );
}

async function expectNoAnnotations(page: Page): Promise<void> {
  await expect(page.locator(".pp-board .pp-sq.is-danger")).toHaveCount(0);
  await expect(page.locator(".pp-board [data-arrow-kind]")).toHaveCount(0);
}
