import { useEffect, useRef } from "react";
import { defaultDifficulty } from "../../shared/game/difficulty.js";
import {
  chooseMove,
  configureOpponent,
  type OpponentEngine,
} from "../engine/levels.js";
import type { GameAction, GameState } from "./reducer.js";

export type EngineLike = OpponentEngine;
export type OpponentOptions = {
  engine: EngineLike | null;
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
  const configured = useRef<{ engine: EngineLike; gameToken: number }>(null);
  const level = state.level ?? defaultDifficulty;
  const { gameToken, turnToken, fen, phase } = state;

  useEffect(() => {
    if (!engine || phase !== "opponentToMove") return;

    let cancelled = false;

    const play = async () => {
      try {
        const startedAt = Date.now();
        if (
          configured.current?.engine !== engine ||
          configured.current.gameToken !== gameToken
        ) {
          await engine.newGame();
          if (cancelled) return;
          await configureOpponent(engine, level);
          if (cancelled) return;
          configured.current = { engine, gameToken };
        }

        const targetDelay = 400 + Math.max(0, Math.min(1, rng())) * 500;
        const uci = await chooseMove(fen, level, rng, engine);
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
  }, [dispatch, engine, fen, gameToken, level, phase, rng, sleep, turnToken]);
}
