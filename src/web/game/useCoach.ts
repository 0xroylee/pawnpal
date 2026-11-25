import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  coachReducer,
  initialCoachState,
  type CoachEvent,
  type CoachState,
} from "../coach/coachState.js";
import type { GameState } from "./reducer.js";

type GameTracker = {
  gameToken: number;
  phase?: GameState["phase"];
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
  useLayoutEffect(() => {
    let previous = tracker.current;
    if (!previous || previous.gameToken !== game.gameToken) {
      if (previous) dispatchCoach({ type: "NEW_GAME" });
      previous = {
        gameToken: game.gameToken,
        historyLength: game.history.length,
        analyses: {},
      };
      tracker.current = previous;
    }

    const previousPhase = previous.phase;
    const previousLength = previous.historyLength;
    const previousAnalyses = previous.analyses;
    previous.phase = game.phase;
    previous.historyLength = game.history.length;
    previous.analyses = game.analyses;

    if (game.result?.reason === "resign") {
      if (previousPhase !== "over") dispatchCoach({ type: "DISMISS" });
      return;
    }

    const newMoves = game.history.slice(previousLength);
    if (newMoves.some((move) => move.color === game.kidColor)) {
      dispatchCoach({ type: "KID_MOVED" });
    } else if (newMoves.length) {
      dispatchCoach({ type: "OPPONENT_MOVED" });
    } else if (
      game.history.length < previousLength ||
      previousPhase === "reveal"
    ) {
      if (game.phase !== "reveal") dispatchCoach({ type: "DISMISS" });
    }

    if (game.phase === "reveal") {
      const analysis = game.retry?.reveal;
      if (analysis && previousPhase !== "reveal") {
        dispatchCoach({ type: "REVEAL", analysis });
      }
      return;
    }

    const latest = game.analyses[game.history.length];
    if (game.phase === "nudge") {
      if (latest && previousPhase !== "nudge") {
        dispatchCoach({ type: "NUDGE", analysis: latest });
      }
      return;
    }
    if (
      latest &&
      previousPhase === "nudge" &&
      game.phase === "opponentToMove"
    ) {
      dispatchCoach({ type: "GRADED", analysis: latest });
      return;
    }
    for (const [ply, analysis] of Object.entries(game.analyses)) {
      if (previousAnalyses[Number(ply)] === analysis) continue;
      dispatchCoach({ type: "GRADED", analysis });
    }
  }, [
    game.analyses,
    game.gameToken,
    game.history,
    game.kidColor,
    game.phase,
    game.result,
    game.retry,
  ]);

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
