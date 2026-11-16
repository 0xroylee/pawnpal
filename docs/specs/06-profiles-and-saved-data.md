# 06: Profiles and saved data

**Depends on:** 01

## Goal

Each kid has a profile that remembers their level, settings, stats and every game. It's stored in a local SQLite file that the parent can back up or export.

## Scope

**Storage**
- Built-in `node:sqlite` (`DatabaseSync`) at `${PAWNPAL_HOME:-~/.pawnpal}/pawnpal.db` with WAL mode on. On macOS and Linux the directory is created with permissions 0700.
- The CLI suppresses Node's `ExperimentalWarning` for `node:sqlite` only.

**Migrations**
- Numbered SQL files in `src/server/db/migrations/`, applied in order at startup and tracked in `schema_migrations`. Forward-only.
- Before running a migration, the server copies the database to `pawnpal.db.bak-<fromVersion>`.

**Schema**

```sql
profiles(id TEXT PRIMARY KEY, name TEXT NOT NULL, avatar TEXT NOT NULL, age INTEGER,
         level INTEGER NOT NULL, voice_on INTEGER NOT NULL, sound_on INTEGER NOT NULL,
         try_again_on INTEGER NOT NULL, created_at TEXT, updated_at TEXT, deleted_at TEXT)
games(id TEXT PRIMARY KEY, profile_id TEXT REFERENCES profiles(id), level INTEGER, kid_color TEXT,
      status TEXT,            -- 'active' | 'finished' | 'aborted'
      result TEXT,            -- 'win' | 'loss' | 'draw'
      termination TEXT, pgn TEXT, analysis_json TEXT, stars INTEGER,
      started_at TEXT, ended_at TEXT)
badges(profile_id TEXT, badge_id TEXT, earned_at TEXT, game_id TEXT,
       PRIMARY KEY (profile_id, badge_id))
level_suggestions(id INTEGER PRIMARY KEY, profile_id TEXT, direction TEXT,
                  created_at TEXT, response TEXT)   -- 'accepted' | 'declined' | NULL
settings(key TEXT PRIMARY KEY, value TEXT)           -- LLM config, PIN hash, network mode
```

**API** (JSON, validated with zod)
- `GET /api/profiles`, `POST /api/profiles`, `PATCH /api/profiles/:id`, `DELETE /api/profiles/:id`. Spec 09 puts create, delete and settings changes behind the parent gate.
- `POST /api/games` starts a game and returns its id.
- `PUT /api/games/:id` autosaves after every move (PGN + analysis).
- `POST /api/games/:id/finish` records the result.
- `GET /api/profiles/:id/games?limit&cursor`, `GET /api/games/:id`.
- `GET /api/profiles/:id/stats` returns games and win/loss/draw per level, plus blunders per game for the last 10 games.
- `GET /api/profiles/:id/export` returns one `.pgn` file of all finished games, with headers `Event "pawnpal"`, player names (the kid's name, or "pawnpal Level N"), `Result`, `Date` and a custom `[PawnpalLevel "N"]`.
- `GET /api/profiles/:id/suggestion` returns the pending level suggestion or null. `POST /api/profiles/:id/suggestion` records accept or decline. Accepting updates the profile's level.

**Screens**
- "Who's playing?" profile picker with built-in SVG avatars (at least 12).
- Create a profile: name, avatar, optional age. In the first-run wizard (spec 09) the parent creates profiles; after that, creating one requires the parent gate.
- "Continue your game?" when the profile has an active game.

**Level suggestions**
- 3 wins in a row at the current level → suggest one level up.
- 4 losses in a row → suggest one level down.
- Draws don't count either way.
- After a decline, there's no new suggestion until another full streak.
- The level never changes without a tap.

**Migration from localStorage.** Sound and level settings from specs 01–02 move into the profile on first load.

## Out of scope

Cloud sync, importing games, multiple households, the parent gate itself (spec 09).

## Acceptance criteria

1. The first start creates the directory and database and runs all migrations. The second start does nothing.
2. `PAWNPAL_HOME=/tmp/x` puts the database in `/tmp/x`.
3. If a migration fails, the backup file remains and the server exits with a message naming the migration.
4. Kill the server mid-game and restart it: "Continue your game?" restores the exact position and analyses.
5. The export file parses with chess.js `loadPgn` for every game in it.
6. The suggestion rules fire exactly as described (table test).
7. A deleted profile disappears from the picker. Hard delete (spec 09) also removes its games and badges.
8. The production dependency tree has no native modules (CI fails if it finds `binding.gyp` or a prebuilt binary).

## Test plan

- **Unit:** repository functions against a database in a temp directory; migration runner including the failure path; suggestion logic.
- **API:** route tests with Hono's `app.request()`.
- **End-to-end:** create a profile, play a few moves, reload the page, continue the game, finish it, find it in history.

## Open questions

- Whether to also offer a zip export of the whole data folder. Leaning towards a "show data folder" button instead.
