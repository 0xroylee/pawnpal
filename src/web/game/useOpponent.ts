import { useEffect, useRef } from "react";
import type { EngineClient } from "../engine/EngineClient.js";
import type { GameAction, GameState } from "./reducer.js";

export type EngineLike = Pick<
  EngineClient,
  "bestMove" | "setOptions" | "newGame"
>;
export type OpponentOptions = {
  engine: EngineLike;
  rng?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function useOpponent(
  state: GameState,
  dispatch: (action: GameAction) => void,
  { engine, rng = Math.random, sleep = defaultSleep }: OpponentOptions,
): void {
  const configuredForGame = useRef(false);

  useEffect(() => {
    if (state.phase === "setup") {
      configuredForGame.current = false;
      return;
    }
    if (state.phase !== "opponentToMove") return;

    let cancelled = false;
    const turnToken = state.turnToken;
    const fen = state.fen;

    const play = async () => {
      try {
        if (!configuredForGame.current) {
          await engine.newGame();
          await engine.setOptions({ "Skill Level": 3 });
          if (cancelled) return;
          configuredForGame.current = true;
        }

        const startedAt = Date.now();
        const uci = await engine.bestMove(fen, { depth: 8 });
        const targetDelay = 400 + Math.max(0, Math.min(1, rng())) * 500;
        const remaining = Math.max(0, targetDelay - (Date.now() - startedAt));
        await sleep(remaining);
        if (!cancelled) dispatch({ type: "OPPONENT_MOVE", uci, turnToken });
      } catch {
        // An engine that fails or a stale turn should not take down the game UI.
      }
    };

    void play();
    return () => {
      cancelled = true;
    };
  }, [dispatch, engine, rng, sleep, state.fen, state.phase, state.turnToken]);
}
