import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { gradeMove } from "../../src/web/coach/grade.js";
import {
  buildContext,
  runDetectors,
} from "../../src/web/coach/detectors/index.js";
import { gameReducer, initialGame } from "../../src/web/game/reducer.js";
import {
  createProfile,
  expectReplyWithinFiveSeconds,
  pickProfile,
  seedGame,
  startServer,
  stopServer,
  uniqueName,
} from "./helpers.js";
import { loadDetectorFixture } from "./replay.js";

test("resumes the saved board after a server crash and exports the finished game", async ({
  page,
}) => {
  const home = await mkdtemp(join(tmpdir(), "pawnpal-restart-"));
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    server = await startServer(home);
    await page.addInitScript(() => {
      if (sessionStorage.getItem("legacy-settings-seeded")) return;
      localStorage.setItem("pawnpal.soundMuted", "true");
      localStorage.setItem("pawnpal.level", "3");
      sessionStorage.setItem("legacy-settings-seeded", "1");
    });
    await page.goto(server.url);
    await page.getByRole("button", { name: "Set up pawnpal" }).click();
    await page.getByLabel("Four-digit PIN").fill("0427");
    await page.getByLabel("Confirm PIN").fill("0428");
    await page.getByRole("button", { name: "Save PIN" }).click();
    await expect(page.getByRole("alert")).toHaveText("The PINs don't match.");
    await page.getByLabel("Confirm PIN").fill("0427");
    await page.getByRole("button", { name: "Save PIN" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Mina");
    await page.getByRole("button", { name: "Fox", exact: true }).click();
    await page.getByRole("button", { name: "Create profile" }).click();
    await page
      .getByRole("button", { name: "Skip, use the built-in coach" })
      .click();
    await page.getByRole("button", { name: "Mina", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Busy Beaver" }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Mighty Lion" }).click();
    await page.getByRole("button", { name: "Play!", exact: true }).click();

    const board = page.locator(".pp-board");
    await board.locator('[data-square="e2"]').click();
    await board.locator('[data-square="e4"]').click();
    await expectReplyWithinFiveSeconds(page, 0);
    await expect(page.getByTestId("debug-grade").first()).toBeVisible();
    await expect(page.getByText("Game saved", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Turn sounds on" }),
    ).toBeVisible();
    const root = server.url;
    const profiles = await (
      await page.request.get(`${root}/api/profiles`)
    ).json();
    expect(profiles).toEqual([
      expect.objectContaining({
        name: "Mina",
        avatar: "fox",
        level: 7,
        soundOn: false,
        activeGameId: expect.any(String),
      }),
    ]);
    const before = JSON.parse(
      (await page.getByTestId("debug-game-record").textContent())!,
    );
    await expect
      .poll(async () => {
        const saved = await (
          await page.request.get(
            `${root}/api/games/${profiles[0].activeGameId}`,
          )
        ).json();
        return {
          pgn: saved.pgn,
          analyses: saved.state.analyses,
          level: saved.level,
          stateLevel: saved.state.level,
        };
      })
      .toEqual({
        pgn: before.pgn,
        analyses: before.analyses,
        level: 7,
        stateLevel: 7,
      });

    await stopServer(server.child, "SIGKILL");
    server = await startServer(home, new URL(root).port);
    await page.goto(server.url);
    await page.getByRole("button", { name: "Mina", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Continue your game?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue game" }).click();
    await expect(page.getByTestId("move")).toHaveCount(2);
    await expect
      .poll(async () =>
        JSON.parse(
          (await page.getByTestId("debug-game-record").textContent())!,
        ),
      )
      .toEqual(before);
    await expect(
      board.locator('[data-square="e4"] [data-piece="wP"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Turn sounds on" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Give up", exact: true }).click();
    await page.getByRole("button", { name: "Yes, give up" }).click();
    await expect(page.getByText("Game saved", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "1 out of 3 stars" }),
    ).toBeVisible();
    await expect(page.getByText("New badge! First game")).toBeVisible();
    await page.getByRole("button", { name: "Home" }).click();
    await page.getByRole("button", { name: "Mina", exact: true }).click();
    await page.getByRole("button", { name: "Game history" }).click();
    await expect(
      page.getByRole("heading", { name: "Mina's games" }),
    ).toBeVisible();
    await expect(page.getByText("Lost", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your badges" }),
    ).toBeVisible();
    await expect(page.getByText("First game", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review game" }).click();
    await expect(
      page.getByRole("heading", { name: "Game review" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "See whole game" }).click();
    await expect(page.getByRole("button", { name: /^1\. e4/ })).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("button", { name: "Parent settings", exact: true })
      .click();
    await page.getByLabel("Four-digit PIN").fill("0427");
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByRole("button", { name: "Data and export" }).click();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download Mina's PGN" }).click();
    const pgn = await download;
    expect(pgn.suggestedFilename()).toBe("pawnpal-games.pgn");
    expect(await pgn.failure()).toBeNull();
  } finally {
    await page.context().close();
    if (server) await stopServer(server.child, "SIGTERM");
    await rm(home, { recursive: true, force: true });
  }
});

test("resumes a waiting nudge and saves its taken-back move", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: class {
        constructor(readonly text: string) {}
      },
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [{ lang: "en-GB", localService: true }],
        cancel() {},
        speak() {},
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
  const fixture = loadDetectorFixture("missed-fork-1");
  const started = gameReducer(initialGame(), {
    type: "NEW_GAME",
    kidColor: fixture.kidColor,
    fen: fixture.fen,
  });
  const moved = gameReducer(started, {
    type: "KID_MOVE",
    from: fixture.move.slice(0, 2),
    to: fixture.move.slice(2, 4),
  });
  const analysis = gradeMove({
    ply: 1,
    fenBefore: fixture.fen,
    kidColor: fixture.kidColor,
    move: { uci: fixture.move, san: moved.history[0]!.san },
    linesBefore: fixture.recorded!.white.linesBefore,
    linesAfter: fixture.recorded!.white.linesAfter,
  });
  const waiting = gameReducer(moved, {
    type: "GRADE_READY",
    ply: 1,
    turnToken: moved.turnToken,
    analysis: {
      ...analysis,
      facts: runDetectors(
        buildContext({ analysis, kidColor: fixture.kidColor }),
      ),
    },
  });
  expect(waiting.phase).toBe("nudge");

  const password = { pin: "0427" };
  const bootstrap = await page.request.post("/api/parent/pin", {
    data: { ...password, confirm: password.pin },
  });
  if (bootstrap.status() === 401)
    expect(
      (await page.request.post("/api/parent/unlock", { data: password })).ok(),
    ).toBe(true);
  else expect(bootstrap.ok()).toBe(true);
  const name = uniqueName("Retry player");
  const profile = await (
    await page.request.post("/api/profiles", {
      data: { name, avatar: "owl" },
    })
  ).json();
  const game = await (
    await page.request.post("/api/games", {
      data: { profileId: profile.id, state: started },
    })
  ).json();
  const savedNudge = await page.request.put(`/api/games/${game.id}`, {
    data: { revision: game.revision, state: waiting },
  });
  expect(savedNudge.ok()).toBe(true);

  await page.goto("/");
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Continue game" }).click();
  await expect(page.getByTestId("move")).toHaveCount(1);
  await page.getByRole("button", { name: "Mute Pip's voice" }).click();
  await expect(
    page.getByRole("button", { name: "Turn on Pip's voice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  const board = page.locator(".pp-board");
  await expect(
    board.locator('[data-square="a2"] [data-piece="wP"]'),
  ).toBeVisible();
  await board.locator('[data-square="f5"]').click();
  await board.locator('[data-square="g7"]').click();
  await expect(page.getByTestId("move")).toHaveCount(2);
  await expect(page.getByTestId("debug-grade").first()).toBeVisible();
  await expect(page.getByText("Game saved", { exact: true })).toBeVisible();
  const record = JSON.parse(
    (await page.getByTestId("debug-game-record").textContent())!,
  );
  expect(record.attempts[1]).toMatchObject([
    { moveUci: fixture.move, grade: "blunder" },
  ]);

  await page.reload();
  await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Continue game" }).click();
  await expect(page.getByTestId("move")).toHaveCount(2);
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Turn on Pip's voice" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      JSON.parse((await page.getByTestId("debug-game-record").textContent())!),
    )
    .toEqual(record);
});

test("marks a move that was never graded with the No grade chip in the review", async ({
  page,
}) => {
  const profile = await createProfile(page, uniqueName("Ungraded kid"));
  const game = await seedGame(page, profile.id);
  // The kid gives up while e4 is still being graded, so it has no grade.
  const moved = gameReducer(game.state, {
    type: "KID_MOVE",
    from: "e2",
    to: "e4",
  });
  const finished = await page.request.post(`/api/games/${game.id}/finish`, {
    data: {
      revision: game.revision,
      state: gameReducer(moved, { type: "RESIGN" }),
    },
  });
  expect(finished.ok()).toBe(true);

  await pickProfile(page, profile.name);
  await page.getByRole("button", { name: "Game history" }).click();
  await page.getByRole("button", { name: "Review game" }).click();
  await page.getByRole("button", { name: "See whole game" }).click();
  const move = page.getByRole("button", {
    name: "1. e4 No grade",
    exact: true,
  });
  await expect(move).toBeVisible();
  const chip = await move.locator(".pp-grade").evaluate((element) => {
    const icon = element.querySelector(".pp-grade__icon")!;
    const box = element.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return {
      height: box.height,
      background: getComputedStyle(element).backgroundColor,
      icon: {
        text: icon.textContent,
        size: [iconBox.width, iconBox.height],
        fill: getComputedStyle(icon).backgroundColor,
        color: getComputedStyle(icon).color,
      },
    };
  });
  expect(chip).toMatchObject({
    height: 36,
    icon: { text: "–", size: [26, 26] },
  });
  expect(chip.background, "the chip has a fill").not.toBe("rgba(0, 0, 0, 0)");
  expect(chip.icon.fill, "the icon has a fill").not.toBe("rgba(0, 0, 0, 0)");
  expect(chip.icon.color, "the dash shows on its fill").not.toBe(
    chip.icon.fill,
  );
});
