import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Chess } from "chess.js";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { openLibrary } from "./db/library.ts";

const homes: string[] = [];
const standardFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function temporaryHome() {
  const home = mkdtempSync(join(tmpdir(), "pawnpal-library-"));
  homes.push(home);
  return home;
}

function openApp(home: string) {
  const library = openLibrary({ home });
  const app = createApp({
    version: "test",
    staticDir: resolve("tests/fixtures/site"),
    dev: false,
    library,
  });
  return { app, library };
}

function json(method: string, value: unknown) {
  return {
    method,
    body: JSON.stringify(value),
    headers: { "Content-Type": "application/json" },
  };
}

async function parentHeaders(app: ReturnType<typeof createApp>) {
  const response = await app.request(
    "/api/parent/pin",
    json("POST", { pin: "0427", confirm: "0427" }),
  );
  expect(response.status).toBe(200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

const startingState = {
  phase: "kidToMove",
  kidColor: "w",
  fen: standardFen,
  startFen: standardFen,
  history: [],
  gameToken: 1,
  turnToken: 1,
  analyses: {},
  pendingGrades: {},
  hintTier: 0,
  offerTryAgain: true,
};

afterEach(() => {
  for (const home of homes.splice(0))
    rmSync(home, { force: true, recursive: true });
});

describe("profile game storage", () => {
  it("restores an active game and its analysis after reopening Pawnpal", async () => {
    const home = temporaryHome();
    const first = openApp(home);
    const retry = {
      moveUci: "d2d4",
      moveSan: "d4",
      grade: "mistake",
      usedShowMe: false,
      revealed: false,
    };
    const state = {
      ...startingState,
      phase: "opponentToMove",
      fen: afterE4,
      turnToken: 4,
      lastMove: { from: "e2", to: "e4" },
      history: [{ san: "e4", uci: "e2e4", from: "e2", to: "e4", color: "w" }],
      analyses: {
        1: {
          ply: 1,
          fenBefore: standardFen,
          moveUci: "e2e4",
          moveSan: "e4",
          linesBefore: [],
          linesAfter: [],
          winBefore: 50,
          winAfter: 54,
          drop: 0,
          grade: "best",
          isOnlyMove: false,
          facts: [],
          attempts: [retry],
        },
      },
    };
    let profileId: string;
    let gameId: string;
    try {
      const created = await first.app.request("/api/profiles", {
        ...json("POST", { name: "Mina", avatar: "fox", age: 8 }),
        headers: {
          "Content-Type": "application/json",
          ...(await parentHeaders(first.app)),
        },
      });
      expect(created.status).toBe(201);
      profileId = (await created.json()).id;
      const started = await first.app.request(
        "/api/games",
        json("POST", { profileId, state: startingState }),
      );
      expect(started.status).toBe(201);
      const game = await started.json();
      gameId = game.id;
      const saved = await first.app.request(
        `/api/games/${gameId}`,
        json("PUT", { revision: game.revision, state }),
      );
      expect(saved.status).toBe(200);
    } finally {
      first.library.close();
    }

    const reopened = openApp(home);
    try {
      const profiles = await reopened.app.request("/api/profiles");
      expect(await profiles.json()).toEqual([
        expect.objectContaining({
          id: profileId,
          name: "Mina",
          activeGameId: gameId,
        }),
      ]);
      const loaded = await reopened.app.request(`/api/games/${gameId}`);
      expect(await loaded.json()).toMatchObject({
        id: gameId,
        revision: 1,
        status: "active",
        pgn: expect.stringContaining("1. e4"),
        state,
      });
    } finally {
      reopened.library.close();
    }
  });

  it("keeps a committed backup when an upgrade fails", () => {
    const root = temporaryHome();
    const home = join(root, "family");
    const migrations = temporaryHome();
    copyFileSync(
      "src/server/db/migrations/001-library.sql",
      join(migrations, "001-library.sql"),
    );
    writeFileSync(
      join(migrations, "002-test-failure.sql"),
      "CREATE TABLE failed_upgrade(id); Not valid SQL;",
    );

    const { library } = openApp(home);
    try {
      library.createProfile({ name: "Mina", avatar: "fox" });
      expect(statSync(join(home, "pawnpal.db")).isFile()).toBe(true);
      if (process.platform !== "win32")
        expect(statSync(home).mode & 0o777).toBe(0o700);
      expect(() => openLibrary({ home, migrations })).toThrow(
        "Migration 002-test-failure.sql failed",
      );
      const backup = new DatabaseSync(join(home, "pawnpal.db.bak-1"), {
        readOnly: true,
      });
      try {
        expect(backup.prepare("SELECT name FROM profiles").get()).toMatchObject(
          { name: "Mina" },
        );
        expect(
          backup.prepare("SELECT version FROM schema_migrations").all(),
        ).toEqual([{ version: 1 }]);
      } finally {
        backup.close();
      }
      const reopened = openLibrary({ home });
      try {
        expect(reopened.listProfiles()).toHaveLength(1);
      } finally {
        reopened.close();
      }
      const current = new DatabaseSync(join(home, "pawnpal.db"), {
        readOnly: true,
      });
      try {
        expect(
          current
            .prepare(
              "SELECT name FROM sqlite_schema WHERE name = 'failed_upgrade'",
            )
            .get(),
        ).toBeUndefined();
        expect(
          current.prepare("SELECT version FROM schema_migrations").all(),
        ).toEqual([{ version: 1 }]);
      } finally {
        current.close();
      }
    } finally {
      library.close();
    }
  });

  it("makes a retried save idempotent and rejects another writer's stale revision", async () => {
    const { app, library } = openApp(temporaryHome());
    try {
      const profile = library.createProfile({ name: "Mina", avatar: "fox" });
      const started = await app.request(
        "/api/games",
        json("POST", { profileId: profile.id, state: startingState }),
      );
      const game = await started.json();
      const state = { ...startingState, hintTier: 1 };
      const url = `/api/games/${game.id}`;
      const payload = json("PUT", { revision: 0, state });
      expect((await app.request(url, payload)).status).toBe(200);
      expect(await (await app.request(url, payload)).json()).toMatchObject({
        revision: 1,
        state,
      });
      expect(
        (
          await app.request(
            url,
            json("PUT", { revision: 0, state: startingState }),
          )
        ).status,
      ).toBe(409);
      const malformed = { ...startingState, fen: afterE4 };
      expect(
        (await app.request(url, json("PUT", { revision: 1, state: malformed })))
          .status,
      ).toBe(400);
      expect(await (await app.request(url)).json()).toMatchObject({
        revision: 1,
        state,
      });
    } finally {
      library.close();
    }
  });

  it("fixes a game's chosen level even after the profile's level changes", async () => {
    const { app, library } = openApp(temporaryHome());
    try {
      const profile = library.createProfile({
        name: "Mina",
        avatar: "fox",
        level: 2,
      });
      const response = await app.request(
        "/api/games",
        json("POST", {
          profileId: profile.id,
          state: { ...startingState, level: 7 },
        }),
      );
      expect(response.status).toBe(201);
      const game = await response.json();
      expect(game).toMatchObject({ level: 7, state: { level: 7 } });
      expect(library.listProfiles()[0]?.level).toBe(7);
      library.updateProfile(profile.id, { level: 4 });
      expect(library.getGame(game.id).state.level).toBe(7);
      const changed = await app.request(
        `/api/games/${game.id}`,
        json("PUT", {
          revision: 0,
          state: { ...startingState, level: 4 },
        }),
      );
      expect(changed.status).toBe(400);
      expect(library.getGame(game.id).revision).toBe(0);
    } finally {
      library.close();
    }
  });

  it("exports finished games for a quoted profile name and hides deleted profiles", async () => {
    const { app, library } = openApp(temporaryHome());
    try {
      const profile = library.createProfile({
        name: 'Mina "Ace"',
        avatar: "fox",
      });
      const game = await finish(app, profile.id, "loss");
      const headers = await parentHeaders(app);
      const exported = await app.request(`/api/profiles/${profile.id}/export`, {
        headers,
      });
      const board = new Chess();
      expect(exported.headers.get("Content-Disposition")).toContain(
        "pawnpal-games.pgn",
      );
      board.loadPgn(await exported.text());
      expect(board.getHeaders()).toMatchObject({
        Event: "pawnpal",
        Result: "0-1",
        PawnpalLevel: "1",
      });
      expect(board.getHeaders().White).toContain("Mina");
      expect(
        await (await app.request(`/api/profiles/${profile.id}/stats`)).json(),
      ).toEqual({
        levels: [{ level: 1, games: 1, wins: 0, losses: 1, draws: 0 }],
        recentBlunders: [{ gameId: game.id, blunders: 0 }],
      });
      expect(
        (
          await app.request(`/api/profiles/${profile.id}`, {
            method: "DELETE",
            headers,
          })
        ).status,
      ).toBe(204);
      expect(await (await app.request("/api/profiles")).json()).toEqual([]);
      expect((await app.request(`/api/games/${game.id}`)).status).toBe(404);
    } finally {
      library.close();
    }
  });

  it.each([
    { outcome: "win", length: 3, direction: "up", target: 4 },
    { outcome: "loss", length: 4, direction: "down", target: 2 },
  ] as const)(
    "suggests $direction after $length decisive results and waits for an explicit choice",
    async ({ outcome, length, direction, target }) => {
      const { app, library } = openApp(temporaryHome());
      try {
        const profile = library.createProfile({
          name: "Mina",
          avatar: "fox",
          level: 3,
        });
        const path = `/api/profiles/${profile.id}/suggestion`;
        await finish(app, profile.id, outcome);
        await finish(app, profile.id, "draw");
        for (let index = 1; index < length - 1; index++)
          await finish(app, profile.id, outcome);
        expect(await (await app.request(path)).json()).toBeNull();
        await finish(app, profile.id, outcome);
        const suggestion = await (await app.request(path)).json();
        expect(suggestion).toMatchObject({ direction, level: target });
        expect(library.listProfiles()[0]?.level).toBe(3);
        await finish(app, profile.id, outcome);

        const declined = await app.request(
          path,
          json("POST", { id: suggestion.id, response: "declined" }),
        );
        expect(await declined.json()).toMatchObject({ level: 3 });
        for (let index = 0; index < length - 1; index++)
          await finish(app, profile.id, outcome);
        expect(await (await app.request(path)).json()).toBeNull();
        await finish(app, profile.id, outcome);
        const replacement = await (await app.request(path)).json();
        const accepted = await app.request(
          path,
          json("POST", { id: replacement.id, response: "accepted" }),
        );
        expect(await accepted.json()).toMatchObject({ level: target });
        expect(await (await app.request(path)).json()).toBeNull();
      } finally {
        library.close();
      }
    },
  );
});

async function finish(
  app: ReturnType<typeof createApp>,
  profileId: string,
  outcome: "win" | "loss" | "draw",
) {
  const started = await app.request(
    "/api/games",
    json("POST", { profileId, state: startingState }),
  );
  expect(started.status).toBe(201);
  const game = await started.json();
  const winner =
    outcome === "win" ? "kid" : outcome === "loss" ? "opponent" : "draw";
  const finished = await app.request(
    `/api/games/${game.id}/finish`,
    json("POST", {
      revision: game.revision,
      state: {
        ...startingState,
        phase: "over",
        result: { winner, reason: outcome === "draw" ? "stalemate" : "resign" },
      },
    }),
  );
  expect(finished.status).toBe(200);
  return finished.json();
}
