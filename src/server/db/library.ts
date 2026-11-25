import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Chess } from "chess.js";
import {
  defaultDifficulty,
  type Difficulty,
} from "../../shared/game/difficulty.ts";
import type {
  GameOutcome,
  GamePage,
  GameSummary,
  LevelSuggestion,
  Profile,
  ProfileSettings,
  ProfileStats,
  SavedGame,
} from "../../shared/game/library.ts";
import { gameRecord } from "../../shared/game/record.ts";
import {
  fixedCount,
  gameBadges,
  starsForGame,
  type Badge,
} from "../../shared/game/rewards.ts";
import type { GameState } from "../../shared/game/types.ts";
import { LibraryFault } from "./fault.ts";
import { migrate, transaction } from "./migrate.ts";
import { llmSettingsSchema } from "./schemas.ts";

const profileQuery = `SELECT p.*,
  (SELECT g.id FROM games g WHERE g.profile_id = p.id AND g.status = 'active') AS active_game_id
  FROM profiles p WHERE p.deleted_at IS NULL`;
const gameQuery = `SELECT g.* FROM games g
  JOIN profiles p ON p.id = g.profile_id WHERE p.deleted_at IS NULL`;

type ProfileRow = {
  id: string;
  name: string;
  avatar: Profile["avatar"];
  age: number | null;
  level: Difficulty;
  voice_on: number;
  sound_on: number;
  try_again_on: number;
  active_game_id: string | null;
};
type GameRow = {
  id: string;
  profile_id: string;
  level: Difficulty;
  kid_color: GameSummary["kidColor"];
  status: GameSummary["status"];
  result: GameOutcome | null;
  termination: string | null;
  started_at: string;
  ended_at: string | null;
  revision: number;
  stars: number | null;
  pgn: string;
  analysis_json: string;
};
type ProfileInput = Pick<ProfileSettings, "name" | "avatar"> &
  Partial<ProfileSettings>;

function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    age: row.age,
    level: row.level,
    voiceOn: Boolean(row.voice_on),
    soundOn: Boolean(row.sound_on),
    tryAgainOn: Boolean(row.try_again_on),
    activeGameId: row.active_game_id,
  };
}

function summaryFromRow(row: GameRow): GameSummary {
  return {
    id: row.id,
    profileId: row.profile_id,
    level: row.level,
    kidColor: row.kid_color,
    status: row.status,
    result: row.result,
    termination: row.termination,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    stars: row.stars,
  };
}

function savedFromRow(row: GameRow): SavedGame {
  const state = JSON.parse(row.analysis_json) as GameState;
  return {
    ...summaryFromRow(row),
    revision: row.revision,
    pgn: row.pgn,
    state: { ...state, level: row.level },
  };
}

export function openLibrary({
  home,
  migrations,
}: { home?: string; migrations?: string } = {}) {
  const directory = resolve(home || join(homedir(), ".pawnpal"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "pawnpal.db");
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;",
    );
    migrate(db, path, migrations);
    const library = new Library(db, directory);
    library.backfillRewards();
    return library;
  } catch (error) {
    db.close();
    throw error;
  }
}

export class Library {
  readonly #db: DatabaseSync;
  readonly dataFolder: string;

  constructor(db: DatabaseSync, dataFolder: string) {
    this.#db = db;
    this.dataFolder = dataFolder;
  }

  close() {
    this.#db.close();
  }

  listProfiles(): Profile[] {
    const rows = this.#db
      .prepare(`${profileQuery} ORDER BY p.created_at, p.rowid`)
      .all() as ProfileRow[];
    return rows.map(profileFromRow);
  }

  #profile(id: string): Profile {
    const row = this.#db.prepare(`${profileQuery} AND p.id = ?`).get(id) as
      ProfileRow | undefined;
    if (!row) throw new LibraryFault(404, "Profile not found");
    return profileFromRow(row);
  }

  createProfile(input: ProfileInput): Profile {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    this.#db
      .prepare(
        `INSERT INTO profiles
      (id, name, avatar, age, level, voice_on, sound_on, try_again_on, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.avatar,
        input.age ?? null,
        input.level ?? defaultDifficulty,
        Number(input.voiceOn ?? true),
        Number(input.soundOn ?? true),
        Number(input.tryAgainOn ?? true),
        timestamp,
        timestamp,
      );
    return this.#profile(id);
  }

  updateProfile(id: string, patch: Partial<ProfileSettings>): Profile {
    return transaction(this.#db, () => {
      const current = this.#profile(id);
      const next = { ...current, ...patch };
      this.#db
        .prepare(
          `UPDATE profiles SET name = ?, avatar = ?, age = ?, level = ?,
        voice_on = ?, sound_on = ?, try_again_on = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          next.name,
          next.avatar,
          next.age,
          next.level,
          Number(next.voiceOn),
          Number(next.soundOn),
          Number(next.tryAgainOn),
          new Date().toISOString(),
          id,
        );
      if (next.level !== current.level) {
        this.#declineLevelSuggestion(id);
      }
      return this.#profile(id);
    });
  }

  #declineLevelSuggestion(profileId: string) {
    this.#db
      .prepare(
        "UPDATE level_suggestions SET response = 'declined' WHERE profile_id = ? AND response IS NULL",
      )
      .run(profileId);
  }

  deleteProfile(id: string) {
    transaction(this.#db, () => {
      this.#profile(id);
      this.#db.prepare("DELETE FROM profiles WHERE id = ?").run(id);
    });
  }

  #abortActive(id: string, timestamp: string) {
    this.#db
      .prepare(
        "UPDATE games SET status = 'aborted', ended_at = ? WHERE profile_id = ? AND status = 'active'",
      )
      .run(timestamp, id);
  }

  startGame(
    profileId: string,
    state: GameState,
    replaceActiveGameId?: string,
  ): SavedGame {
    if (state.history.length || state.result)
      throw new LibraryFault(400, "Expected a new game");
    return transaction(this.#db, () => {
      const profile = this.#profile(profileId);
      if (
        profile.activeGameId &&
        profile.activeGameId !== replaceActiveGameId
      ) {
        throw new LibraryFault(409, "A game is already in progress");
      }
      const timestamp = new Date().toISOString();
      if (profile.activeGameId) this.#abortActive(profileId, timestamp);
      const level = state.level ?? profile.level;
      if (level !== profile.level) {
        this.#db
          .prepare("UPDATE profiles SET level = ?, updated_at = ? WHERE id = ?")
          .run(level, timestamp, profileId);
        this.#declineLevelSuggestion(profileId);
      }
      const id = randomUUID();
      const saved = { ...state, level, offerTryAgain: profile.tryAgainOn };
      this.#db
        .prepare(
          `INSERT INTO games
        (id, profile_id, level, kid_color, status, pgn, analysis_json, started_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
        )
        .run(
          id,
          profileId,
          level,
          saved.kidColor,
          gameRecord(saved).pgn,
          JSON.stringify(saved),
          timestamp,
        );
      return this.getGame(id);
    });
  }

  #game(id: string): GameRow {
    const row = this.#db.prepare(`${gameQuery} AND g.id = ?`).get(id) as
      GameRow | undefined;
    if (!row) throw new LibraryFault(404, "Game not found");
    return row;
  }

  getGame(id: string): SavedGame {
    const game = savedFromRow(this.#game(id));
    return game.status === "finished"
      ? {
          ...game,
          newBadges: this.#db
            .prepare(
              "SELECT badge_id AS id, earned_at AS earnedAt FROM badges WHERE game_id = ? ORDER BY rowid",
            )
            .all(id) as Badge[],
        }
      : game;
  }

  badges(profileId: string): Badge[] {
    this.#profile(profileId);
    return this.#db
      .prepare(
        "SELECT badge_id AS id, earned_at AS earnedAt FROM badges WHERE profile_id = ? ORDER BY rowid",
      )
      .all(profileId) as Badge[];
  }

  backfillRewards() {
    const pending = `${gameQuery} AND g.status = 'finished' AND g.stars IS NULL`;
    if (!this.#db.prepare(`${pending} LIMIT 1`).get()) return;
    transaction(this.#db, () => {
      const finished = this.#db
        .prepare(`${pending} ORDER BY g.rowid`)
        .all() as GameRow[];
      const stars = this.#db.prepare("UPDATE games SET stars = ? WHERE id = ?");
      for (const row of finished) {
        const { state } = savedFromRow(row);
        const count = starsForGame(state);
        if (count === null || !row.ended_at) continue;
        stars.run(count, row.id);
        this.#awardBadges(row, state, row.ended_at);
      }
    });
  }

  #awardBadges(row: GameRow, state: GameState, endedAt: string) {
    const previous = this.#db
      .prepare(
        "SELECT MAX(level) AS level FROM games WHERE profile_id = ? AND status = 'finished' AND result = 'win' AND rowid < (SELECT rowid FROM games WHERE id = ?)",
      )
      .get(row.profile_id, row.id)?.level;
    let totalFixed = fixedCount(state);
    if (
      totalFixed > 0 &&
      !this.#db
        .prepare(
          "SELECT 1 FROM badges WHERE profile_id = ? AND badge_id = 'try-again-hero'",
        )
        .get(row.profile_id)
    ) {
      for (const game of this.#db
        .prepare(
          "SELECT analysis_json FROM games WHERE profile_id = ? AND status = 'finished' AND rowid < (SELECT rowid FROM games WHERE id = ?)",
        )
        .iterate(row.profile_id, row.id)) {
        totalFixed += fixedCount(
          JSON.parse(String(game.analysis_json)) as GameState,
        );
        if (totalFixed >= 5) break;
      }
    }
    const award = this.#db.prepare(
      "INSERT INTO badges (profile_id, badge_id, earned_at, game_id) VALUES (?, ?, ?, ?) ON CONFLICT(profile_id, badge_id) DO NOTHING",
    );
    for (const badge of gameBadges(
      state,
      row.level,
      typeof previous === "number" ? previous : null,
      totalFixed,
    )) {
      award.run(row.profile_id, badge, endedAt, row.id);
    }
  }

  saveGame(id: string, revision: number, state: GameState): SavedGame {
    const result = state.result;
    const outcome =
      result &&
      (result.winner === "kid"
        ? "win"
        : result.winner === "opponent"
          ? "loss"
          : "draw");
    return transaction(this.#db, () => {
      const row = this.#game(id);
      if (row.status === "aborted")
        throw new LibraryFault(409, "This game was replaced");
      if (state.level !== undefined && state.level !== row.level)
        throw new LibraryFault(400, "Game level changed");
      const saved = savedFromRow(row);
      const snapshot = JSON.stringify({ ...state, level: row.level });
      if (revision !== row.revision) {
        // Older clients can retrigger a save without sending the fixed level.
        if (
          revision + 1 === row.revision &&
          JSON.stringify({ ...state, level: undefined }) ===
            JSON.stringify({ ...saved.state, level: undefined })
        )
          return this.getGame(id);
        throw new LibraryFault(409, "This game was saved elsewhere");
      }
      if (
        state.kidColor !== row.kid_color ||
        state.startFen !== saved.state.startFen
      ) {
        throw new LibraryFault(400, "Game position or color changed");
      }
      if (
        row.status === "finished" &&
        (outcome !== row.result || result?.reason !== row.termination)
      ) {
        throw new LibraryFault(409, "The game has already ended");
      }
      const endedAt =
        row.ended_at ?? (result ? new Date().toISOString() : null);
      this.#db
        .prepare(
          `UPDATE games SET status = ?, pgn = ?, analysis_json = ?, result = ?,
        termination = ?, ended_at = ?, stars = ?, revision = revision + 1 WHERE id = ?`,
        )
        .run(
          result ? "finished" : "active",
          gameRecord(state).pgn,
          snapshot,
          outcome ?? null,
          result?.reason ?? null,
          endedAt,
          starsForGame(state),
          id,
        );
      if (result && endedAt) this.#awardBadges(row, state, endedAt);
      if (result && row.status === "active")
        this.#suggest(id, row.profile_id, row.level);
      return this.getGame(id);
    });
  }

  listGames(profileId: string, limit: number, cursor?: string): GamePage {
    this.#profile(profileId);
    const boundary = cursor
      ? this.#db
          .prepare("SELECT rowid FROM games WHERE id = ? AND profile_id = ?")
          .get(cursor, profileId)?.rowid
      : undefined;
    if (cursor && boundary === undefined)
      throw new LibraryFault(400, "Invalid game cursor");
    const rows = this.#db
      .prepare(
        `SELECT * FROM games WHERE profile_id = ? AND (? IS NULL OR rowid < ?)
      ORDER BY rowid DESC LIMIT ?`,
      )
      .all(
        profileId,
        boundary ?? null,
        boundary ?? null,
        limit + 1,
      ) as GameRow[];
    const games = rows.slice(0, limit).map(summaryFromRow);
    return { games, nextCursor: rows.length > limit ? games.at(-1)!.id : null };
  }

  stats(profileId: string): ProfileStats {
    this.#profile(profileId);
    const levels = this.#db
      .prepare(
        `SELECT level, count(*) AS games,
      sum(result = 'win') AS wins, sum(result = 'loss') AS losses, sum(result = 'draw') AS draws
      FROM games WHERE profile_id = ? AND status = 'finished' GROUP BY level ORDER BY level`,
      )
      .all(profileId) as ProfileStats["levels"];
    const recent = this.#db
      .prepare(
        `SELECT * FROM games WHERE profile_id = ? AND status = 'finished'
      ORDER BY rowid DESC LIMIT 10`,
      )
      .all(profileId) as GameRow[];
    return {
      levels,
      recentBlunders: recent.map((row) => ({
        gameId: row.id,
        blunders: Object.values(savedFromRow(row).state.analyses).filter(
          ({ grade }) => grade === "blunder",
        ).length,
      })),
    };
  }

  exportGames(profileId: string): string {
    const profile = this.#profile(profileId);
    const games = this.#db
      .prepare(
        "SELECT * FROM games WHERE profile_id = ? AND status = 'finished' ORDER BY rowid",
      )
      .all(profileId) as GameRow[];
    // chess.js cannot parse escaped quotes in PGN tag values.
    const name = profile.name.replace(/[\r\n]+/g, " ").replaceAll('"', "＂");
    return games
      .map((game) => {
        const board = new Chess();
        board.loadPgn(game.pgn);
        const opponent = `pawnpal Level ${game.level}`;
        board.setHeader("Event", "pawnpal");
        board.setHeader("White", game.kid_color === "w" ? name : opponent);
        board.setHeader("Black", game.kid_color === "b" ? name : opponent);
        board.setHeader(
          "Date",
          game.started_at.slice(0, 10).replaceAll("-", "."),
        );
        board.setHeader("PawnpalLevel", String(game.level));
        return board.pgn();
      })
      .join("\n\n");
  }

  #suggest(id: string, profileId: string, level: number) {
    if (
      this.#profile(profileId).level !== level ||
      this.getSuggestion(profileId)
    )
      return;
    const recent = this.#db
      .prepare(
        `SELECT result FROM games
      WHERE profile_id = ? AND level = ? AND status = 'finished' AND result <> 'draw'
      AND rowid > coalesce((SELECT g.rowid FROM level_suggestions s
        JOIN games g ON g.id = s.game_id WHERE s.profile_id = ? ORDER BY s.id DESC LIMIT 1), 0)
      ORDER BY rowid DESC LIMIT 4`,
      )
      .all(profileId, level, profileId)
      .map(({ result }) => result);
    const direction =
      level < 8 &&
      recent.length >= 3 &&
      recent.slice(0, 3).every((item) => item === "win")
        ? "up"
        : level > 1 &&
            recent.length === 4 &&
            recent.every((item) => item === "loss")
          ? "down"
          : null;
    if (direction) {
      this.#db
        .prepare(
          "INSERT INTO level_suggestions (profile_id, direction, created_at, game_id) VALUES (?, ?, ?, ?)",
        )
        .run(profileId, direction, new Date().toISOString(), id);
    }
  }

  getSuggestion(profileId: string): LevelSuggestion | null {
    const profile = this.#profile(profileId);
    const row = this.#db
      .prepare(
        `SELECT id, direction FROM level_suggestions
      WHERE profile_id = ? AND response IS NULL`,
      )
      .get(profileId) as Pick<LevelSuggestion, "id" | "direction"> | undefined;
    return row
      ? { ...row, level: profile.level + (row.direction === "up" ? 1 : -1) }
      : null;
  }

  respondToSuggestion(
    profileId: string,
    id: number,
    response: "accepted" | "declined",
  ): Profile {
    return transaction(this.#db, () => {
      const pending = this.getSuggestion(profileId);
      if (pending?.id !== id)
        throw new LibraryFault(
          409,
          "That level suggestion is no longer pending",
        );
      this.#db
        .prepare(
          `UPDATE level_suggestions SET response = ?, game_id = coalesce(
          (SELECT id FROM games WHERE profile_id = ? AND status = 'finished'
           ORDER BY rowid DESC LIMIT 1), game_id) WHERE id = ?`,
        )
        .run(response, profileId, id);
      if (response === "accepted") {
        this.#db
          .prepare("UPDATE profiles SET level = ?, updated_at = ? WHERE id = ?")
          .run(pending.level, new Date().toISOString(), profileId);
      }
      return this.#profile(profileId);
    });
  }

  getLlmSettings() {
    const value = this.getSetting("llm");
    if (typeof value === "string") {
      try {
        const result = llmSettingsSchema.safeParse(
          JSON.parse(value) as unknown,
        );
        if (result.success) return result.data;
      } catch {
        // Invalid settings fall back to the disabled defaults.
      }
    }
    return llmSettingsSchema.parse({});
  }

  getSetting(key: string): string | undefined {
    const value = this.#db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key)?.value;
    return typeof value === "string" ? value : undefined;
  }

  setSetting(key: string, value: string) {
    this.#db
      .prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  clearSetting(key: string) {
    this.#db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  reset() {
    transaction(this.#db, () =>
      this.#db.exec("DELETE FROM profiles; DELETE FROM settings;"),
    );
  }
}
