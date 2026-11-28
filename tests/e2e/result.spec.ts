import { expect, test, type Page } from "@playwright/test";
import type { Profile } from "../../src/shared/game/library.js";
import { gradeMove } from "../../src/web/coach/grade.js";
import {
  buildContext,
  runDetectors,
} from "../../src/web/coach/detectors/index.js";
import { gameReducer, type GameState } from "../../src/web/game/reducer.js";
import {
  createProfile,
  expectOnFirstScreen,
  expectReplyWithinFiveSeconds,
  openMissedFork,
  pickProfile,
  playMove,
  seedGame,
  uniqueName,
  winByCheckmate,
} from "./helpers.js";
import { loadDetectorFixture } from "./replay.js";

const threeBadges = [
  "New badge! First game",
  "New badge! First win",
  "New badge! First checkmate",
];

function resultParts(page: Page) {
  return {
    main: page.getByRole("button", {
      name: "Let's look at your game with Pip",
    }),
    playAgain: page.getByRole("button", { name: "Play again" }),
    home: page.getByRole("button", { name: "Home" }),
    saved: page.getByRole("status").filter({ hasText: "Game saved" }),
    badges: page.locator('ul[aria-live="polite"]').getByRole("listitem"),
    stats: page.locator(".pp-result .pp-stat"),
  };
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
]) {
  test(`fits a three-badge checkmate win on one screen at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const profile = await createProfile(page, uniqueName("Checkmate kid"));
    await winByCheckmate(page, profile);

    const result = resultParts(page);
    await expect(page.locator(".pp-board")).toHaveCount(0);
    await expect(
      page.getByRole("img", { name: "3 out of 3 stars" }),
    ).toBeVisible();
    // Ra8# is graded after the game ends, so the Great moves tile can follow
    // the result card by a few seconds.
    await expect(result.stats).toHaveText(
      [/^Great moves\s*1$/, /^Moves\s*1$/],
      { timeout: 10_000 },
    );
    await expect(result.badges).toHaveText(threeBadges);
    await expect(result.saved).toBeVisible();

    const tops = await result.badges.evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size, "the badges share one row").toBe(1);
    await expectOnFirstScreen(page, [
      result.main,
      result.playAgain,
      result.home,
      result.saved,
    ]);

    const card = (await page.locator(".pp-result__card").boundingBox())!;
    const saved = (await result.saved.boundingBox())!;
    expect(saved.y, "Game saved sits under the card").toBeGreaterThanOrEqual(
      card.y + card.height,
    );
    expect(
      Math.abs(saved.x + saved.width / 2 - (card.x + card.width / 2)),
      "Game saved is centered under the card",
    ).toBeLessThanOrEqual(2);
  });
}

// Badges a single game can earn on a new profile. Level up needs an earlier
// win, try again hero needs five fixed mistakes, a clean game needs 20 graded
// moves and a comeback needs a losing move, so a short seeded game reaches
// four: the first three plus Fork finder.
const fourBadges = [...threeBadges, "New badge! Fork finder"];

// Seeds a game that opens with the recorded knight fork from played-fork-1,
// takes the queen and promotes the a-pawn, so the kid has Qg7# to play.
async function seedForkThenMateInOne(page: Page, profile: Profile) {
  const fork = loadDetectorFixture("played-fork-1");
  const game = await seedGame(page, profile.id, { fen: fork.fen });
  let state = gameReducer(game.state, {
    type: "KID_MOVE",
    from: fork.move.slice(0, 2),
    to: fork.move.slice(2, 4),
  });
  const analysis = gradeMove({
    ply: 1,
    fenBefore: fork.fen,
    kidColor: fork.kidColor,
    move: { uci: fork.move, san: state.history[0]!.san },
    linesBefore: fork.recorded!.white.linesBefore,
    linesAfter: fork.recorded!.white.linesAfter,
  });
  state = gameReducer(state, {
    type: "GRADE_READY",
    ply: 1,
    turnToken: state.turnToken,
    analysis: {
      ...analysis,
      facts: runDetectors(buildContext({ analysis, kidColor: fork.kidColor })),
    },
  });
  expect(state.analyses[1]?.facts.map(({ kind }) => kind)).toContain(
    "played-fork",
  );
  const reply = (uci: string, current: GameState) =>
    gameReducer(current, {
      type: "OPPONENT_MOVE",
      uci,
      turnToken: current.turnToken,
    });
  state = reply("e8f7", state);
  for (const [kidMove, opponentMove] of [
    ["g7e6", "f7g8"],
    ["a2a4", "g8h8"],
    ["a4a5", "h8g8"],
    ["a5a6", "g8h8"],
    ["a6a7", "h8g8"],
    ["a7a8q", "g8h7"],
    ["a8a7", "h7h8"],
  ] as const) {
    state = gameReducer(state, {
      type: "KID_MOVE",
      from: kidMove.slice(0, 2),
      to: kidMove.slice(2, 4),
      ...(kidMove[4] ? { promotion: kidMove[4] } : {}),
    });
    state = gameReducer(state, {
      type: "GRADE_TIMEOUT",
      ply: state.history.length,
      turnToken: state.turnToken,
    });
    state = reply(opponentMove, state);
  }
  expect(state.phase).toBe("kidToMove");
  expect(state.fen).toBe("7k/Q7/4N3/8/8/8/8/K7 w - - 3 9");
  const saved = await page.request.put(`/api/games/${game.id}`, {
    data: { revision: game.revision, state },
  });
  expect(saved.ok()).toBe(true);
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 768, height: 1024 },
]) {
  test(`fits four badges from a fork and a checkmate on one screen at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const profile = await createProfile(page, uniqueName("Fork kid"));
    await seedForkThenMateInOne(page, profile);
    await pickProfile(page, profile.name);
    await page.getByRole("button", { name: "Continue game" }).click();
    await expect(page.getByTestId("move")).toHaveCount(16);
    await playMove(page, "a7g7");
    await expect(
      page.getByRole("heading", { name: "You win by checkmate!" }),
    ).toBeVisible();

    const result = resultParts(page);
    await expect(
      page.getByRole("img", { name: "3 out of 3 stars" }),
    ).toBeVisible();
    // Qg7# is graded after the game ends and can add a second great move.
    await expect(result.stats).toHaveText(
      [/^Great moves\s*[12]$/, /^Moves\s*9$/],
      { timeout: 10_000 },
    );
    await expect(result.badges).toHaveText(fourBadges);
    await expect(result.saved).toBeVisible();

    const tops = await result.badges.evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size, "the badges share one row").toBe(1);
    await expectOnFirstScreen(page, [
      ...(await result.badges.all()),
      result.main,
      result.playAgain,
      result.home,
      result.saved,
    ]);
  });
}

test("opens the game review from the result card", async ({ page }) => {
  const profile = await createProfile(page, uniqueName("Review kid"));
  await winByCheckmate(page, profile);
  await resultParts(page).main.click();
  await expect(
    page.getByRole("heading", { name: "Game review" }),
  ).toBeVisible();
});

test("starts a new game from Play again", async ({ page }) => {
  const profile = await createProfile(page, uniqueName("Again kid"));
  await winByCheckmate(page, profile);
  await resultParts(page).playAgain.click();
  await expect(
    page.getByRole("heading", { name: "Let's play chess!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play!", exact: true }).click();
  await expect(page.locator(".pp-board")).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Give up", exact: true }),
  ).toBeVisible();
});

test("shows one star and one badge after giving up a first game, then goes home", async ({
  page,
}) => {
  const profile = await createProfile(page, uniqueName("Resign kid"));
  await pickProfile(page, profile.name);
  await page.getByRole("button", { name: "Play!", exact: true }).click();
  await playMove(page, "e2e4");
  await expectReplyWithinFiveSeconds(page, 0);
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();

  const result = resultParts(page);
  await expect(
    page.getByRole("heading", { name: "Computer wins this game." }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "1 out of 3 stars" }),
  ).toBeVisible();
  await expect(result.badges).toHaveText(["New badge! First game"]);
  await expect(result.stats).toHaveText([/^Moves\s*1$/]);
  await expect(result.saved).toBeVisible();

  await result.home.click();
  await expect(
    page.getByRole("heading", { name: "Who's playing?" }),
  ).toBeVisible();
});

test("counts a mistake fixed with Try again on the result card", async ({
  page,
}) => {
  const { miss, fork } = await openMissedFork(page);
  await playMove(page, miss);
  await page.getByRole("button", { name: "Try again" }).click();
  await playMove(page, fork);
  await expect(page.getByText("That's better!", { exact: true })).toBeVisible();
  await expect(page.getByTestId("move")).toHaveCount(2);
  await page.getByRole("button", { name: "Give up", exact: true }).click();
  await page.getByRole("button", { name: "Yes, give up" }).click();

  await expect(
    page.getByRole("heading", { name: "Computer wins this game." }),
  ).toBeVisible();
  await expect(resultParts(page).stats).toHaveText([
    /^Great moves\s*1$/,
    /^Fixed it\s*1$/,
    /^Moves\s*1$/,
  ]);
});
