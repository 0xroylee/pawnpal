import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  coachReducer,
  initialCoachState,
  type CoachEvent,
  type CoachState,
} from "../coach/coachState.js";
import type { GameState } from "./reducer.js";

type GameTracker = {
  gameKey: number;
  historyLength: number;
  analyses: Record<number, GameState["analyses"][number]>;
};

export function useCoach(
  game: GameState,
  rng: () => number = Math.random,
): {
  coach: CoachState;
  dismiss: () => void;
} {
  const [variantSeed] = useState(() => rng());
  const reducer = useCallback(
    (state: CoachState, event: CoachEvent) =>
      coachReducer(state, event, {
        variantSeed,
        kidColor: game.kidColor,
      }),
    [game.kidColor, variantSeed],
  );
  const [coach, dispatchCoach] = useReducer(reducer, initialCoachState);
  const tracker = useRef<GameTracker | null>(null);
  const gameKey = game.turnToken - game.history.length;

  useEffect(() => {
    let previous = tracker.current;
    if (!previous) {
      previous = {
        gameKey,
        historyLength: game.history.length,
        analyses: {},
      };
      tracker.current = previous;
    } else if (previous.gameKey !== gameKey) {
      tracker.current = {
        gameKey,
        historyLength: game.history.length,
        analyses: {},
      };
      dispatchCoach({ type: "NEW_GAME" });
      return;
    }

    const newMoves = game.history.slice(previous.historyLength);
    if (newMoves.some((move) => move.color === game.kidColor)) {
      dispatchCoach({ type: "KID_MOVED" });
    }
    previous.historyLength = game.history.length;

    for (const [ply, analysis] of Object.entries(game.analyses)) {
      const numberPly = Number(ply);
      if (previous.analyses[numberPly] === analysis) continue;
      previous.analyses[numberPly] = analysis;
      dispatchCoach({ type: "GRADED", analysis });
    }
  }, [game.analyses, game.history, game.kidColor, gameKey]);

  useEffect(() => {
    if (game.hintTier === 0) return;
    const preAnalysis =
      game.preAnalysis?.fen === game.fen ? game.preAnalysis.lines : undefined;
    dispatchCoach({
      type: "HINT",
      tier: game.hintTier,
      fen: game.fen,
      ply: game.history.length,
      ...(preAnalysis ? { lines: preAnalysis } : {}),
    });
  }, [game.fen, game.history.length, game.hintTier, game.preAnalysis]);

  useEffect(() => {
    if (coach.message?.mode !== "praise") return;
    const timer = globalThis.setTimeout(
      () => dispatchCoach({ type: "PRAISE_EXPIRED" }),
      2500,
    );
    return () => globalThis.clearTimeout(timer);
  }, [coach.message]);

  const dismiss = useCallback(() => dispatchCoach({ type: "DISMISS" }), []);

  return { coach, dismiss };
}
