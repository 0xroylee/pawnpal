import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Chess, type Square } from "chess.js";
import type { EngineLine } from "../../shared/coach/types.ts";
import {
  createAnalysisPipeline,
  type AnalystLike,
} from "../coach/analysisPipeline.js";
import { defaultGradeConfig } from "../coach/gradeConfig.js";
import { gradeMove } from "../coach/grade.js";
import { buildContext, runDetectors } from "../coach/detectors/index.js";
import type { GameAction, GameState } from "./reducer.js";

export type GradingPipeline = ReturnType<typeof createAnalysisPipeline>;
export type GradingPipelineFactory = (engine: AnalystLike) => GradingPipeline;

export type GradingOptions = {
  analyst: AnalystLike | null;
  pipeline?: GradingPipelineFactory;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
};

export function useGrading(
  state: GameState,
  dispatch: (action: GameAction) => void,
  {
    analyst,
    pipeline: pipelineFactory,
    setTimeout: schedule = globalThis.setTimeout,
    clearTimeout: cancel = globalThis.clearTimeout,
  }: GradingOptions,
): void {
  const pipeline = useMemo(
    () =>
      analyst ? (pipelineFactory ?? createAnalysisPipeline)(analyst) : null,
    [analyst, pipelineFactory],
  );
  const latestState = useRef(state);
  const mounted = useRef(true);

  useLayoutEffect(() => {
    latestState.current = state;
  }, [state]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (state.phase !== "setup" || !pipeline) return;
    void pipeline.reset().catch(() => undefined);
  }, [pipeline, state.phase]);

  useEffect(() => {
    if (state.phase !== "kidToMove" || !pipeline) return;
    let cancelled = false;
    void pipeline
      .preAnalyze(state.fen)
      .then((lines: EngineLine[]) => {
        if (!cancelled) {
          dispatch({ type: "PRE_ANALYSIS_READY", fen: state.fen, lines });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [dispatch, pipeline, state.fen, state.phase, state.turnToken]);

  useEffect(() => {
    const lastMove = state.history.at(-1);
    const kidMoved = lastMove?.color === state.kidColor;
    const grading = state.phase === "grading";
    const endedByKid = kidMoved && lastMove.ending !== undefined;
    if (!grading && !endedByKid) return;

    const ply = state.history.length;
    const turnToken = state.turnToken;
    const gameToken = state.gameToken;
    const canDispatch = () =>
      !cancelled &&
      mounted.current &&
      latestState.current.gameToken === gameToken &&
      latestState.current.result?.reason !== "resign";
    let cancelled = false;
    let timedOut = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

    if (!pipeline) {
      if (grading) {
        dispatch({ type: "GRADE_TIMEOUT", ply, turnToken });
      }
      return;
    }

    if (grading) {
      timer = schedule(() => {
        timedOut = true;
        dispatch({ type: "GRADE_TIMEOUT", ply, turnToken });
      }, defaultGradeConfig.analysis.gradeTimeoutMs);
    }

    const fenBefore = fenBeforeLastMove(state.startFen, state.history);
    const analysisOptions = endedByKid ? { terminal: true } : undefined;
    void pipeline
      .analyzeKidMove(fenBefore, state.fen, analysisOptions)
      .then(({ linesBefore, linesAfter }) => {
        if (!canDispatch() || !lastMove) return;
        const graded = gradeMove({
          ply,
          fenBefore,
          move: { uci: lastMove.uci, san: lastMove.san },
          kidColor: state.kidColor,
          linesBefore,
          linesAfter,
          ending: lastMove.ending,
        });
        const analysis = {
          ...graded,
          facts: lastMove.ending
            ? []
            : runDetectors(
                buildContext({ analysis: graded, kidColor: state.kidColor }),
              ),
        };
        dispatch({ type: "GRADE_READY", ply, turnToken, analysis });
      })
      .catch(() => {
        if (canDispatch() && grading && !timedOut) {
          dispatch({ type: "GRADE_TIMEOUT", ply, turnToken });
        }
      });

    return () => {
      if (latestState.current.gameToken !== gameToken || !mounted.current) {
        cancelled = true;
      }
      if (timer !== undefined) cancel(timer);
    };
  }, [
    cancel,
    dispatch,
    pipeline,
    schedule,
    state.fen,
    state.gameToken,
    state.history,
    state.kidColor,
    state.phase,
    state.startFen,
    state.turnToken,
  ]);

  useEffect(
    () => () => {
      pipeline?.dispose();
    },
    [pipeline],
  );
}

function fenBeforeLastMove(
  startFen: string,
  history: GameState["history"],
): string {
  const chess = new Chess(startFen);
  for (const move of history.slice(0, -1)) {
    chess.move({
      from: move.from as Square,
      to: move.to as Square,
      ...(move.uci[4] ? { promotion: move.uci[4] } : {}),
    });
  }
  return chess.fen();
}
