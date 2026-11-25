import type { SavedGame } from "../../shared/game/library.js";
import { library } from "./libraryClient.js";
import type { GameState } from "./reducer.js";

export type SaveStatus = "saving" | "saved" | "failed";

function snapshot(state: GameState) {
  const saved = { ...state, preAnalysis: undefined };
  return { state: saved, key: JSON.stringify(saved) };
}

export function createGameSaver(
  game: SavedGame,
  onStatus: (status: SaveStatus) => void,
  onSaved?: (game: SavedGame) => void,
) {
  let revision = game.revision;
  let written = snapshot(game.state).key;
  let next: ReturnType<typeof snapshot> | undefined;
  let active: ReturnType<typeof snapshot> | undefined;
  let running: Promise<boolean> | undefined;
  let failed = false;

  async function drain() {
    onStatus("saving");
    while (active || next) {
      if (!active) {
        active = next!;
        next = undefined;
      }
      try {
        // A reply can be lost after SQLite commits. Retry the identical revision
        // and payload first so the server can acknowledge that write.
        const saved = await library.saveGame(game.id, revision, active.state);
        revision = saved.revision;
        written = active.key;
        active = undefined;
        onSaved?.(saved);
      } catch {
        failed = true;
        onStatus("failed");
        return false;
      }
    }
    onStatus("saved");
    return true;
  }

  function flush(): Promise<boolean> {
    if (running) return running;
    if (!active && !next) return Promise.resolve(true);
    failed = false;
    running = drain().finally(() => {
      running = undefined;
    });
    return running;
  }

  return {
    enqueue(state: GameState) {
      const candidate = snapshot(state);
      if (
        candidate.key === (next ?? active)?.key ||
        (!active && !next && candidate.key === written)
      )
        return;
      next = candidate;
      if (!failed) void flush();
    },
    flush,
  };
}
