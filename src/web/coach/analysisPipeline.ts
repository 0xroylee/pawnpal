import type { EngineClient, EngineLine } from "../engine/EngineClient.js";
import { defaultGradeConfig, type AnalysisConfig } from "./gradeConfig.js";

export type AnalystLike = Pick<EngineClient, "analyze" | "stop" | "newGame">;

type PreAnalysis = {
  fen: string;
  promise: Promise<EngineLine[]>;
  settled: boolean;
  lines?: EngineLine[];
};

export type KidMoveAnalysisOptions = {
  terminal?: boolean;
};

export function createAnalysisPipeline(
  engine: AnalystLike,
  config: AnalysisConfig = defaultGradeConfig.analysis,
) {
  let preAnalysis: PreAnalysis | null = null;
  let moveAnalysis: Promise<void> | null = null;
  let disposed = false;

  const startPreAnalysis = (fen: string): Promise<EngineLine[]> => {
    const current: PreAnalysis = {
      fen,
      promise: Promise.resolve([]),
      settled: false,
    };
    current.promise = engine.analyze(fen, config.preAnalyze).then(
      (lines) => {
        current.settled = true;
        current.lines = lines;
        return lines;
      },
      (error: unknown) => {
        current.settled = true;
        throw error;
      },
    );
    preAnalysis = current;
    return current.promise;
  };

  const drainPreAnalysis = async (
    current: PreAnalysis,
  ): Promise<EngineLine[]> => {
    if (!current.settled) await engine.stop();
    return current.promise;
  };

  const preAnalyze = (fen: string): Promise<EngineLine[]> => {
    if (disposed) return Promise.resolve([]);
    if (moveAnalysis) {
      const activeMove = moveAnalysis;
      return activeMove.then(
        () => preAnalyze(fen),
        () => preAnalyze(fen),
      );
    }
    if (preAnalysis?.fen === fen) return preAnalysis.promise;
    if (preAnalysis) {
      const previous = preAnalysis;
      return drainPreAnalysis(previous).then(() => {
        if (preAnalysis === previous) preAnalysis = null;
        return preAnalyze(fen);
      });
    }
    return startPreAnalysis(fen);
  };

  const analyzeKidMove = async (
    fenBefore: string,
    fenAfter: string,
    options: KidMoveAnalysisOptions = {},
  ): Promise<{ linesBefore: EngineLine[]; linesAfter: EngineLine[] }> => {
    const previousMove = moveAnalysis;
    const operation = Promise.resolve(previousMove).then(async () => {
      const cached = preAnalysis;
      preAnalysis = null;
      let linesBefore: EngineLine[] | undefined;

      if (cached) {
        const lines = await drainPreAnalysis(cached);
        const reachedMinDepth =
          lines.length > 0 &&
          Math.min(...lines.map((line) => line.depth)) >= config.minReuseDepth;
        if (cached.fen === fenBefore && reachedMinDepth) linesBefore = lines;
      }

      if (!linesBefore) {
        linesBefore = await engine.analyze(fenBefore, config.fallback);
        const fallbackReachedMinDepth =
          linesBefore.length > 0 &&
          Math.min(...linesBefore.map((line) => line.depth)) >=
            config.minReuseDepth;
        if (!fallbackReachedMinDepth) {
          throw new Error(
            `Fallback analysis did not reach depth ${config.minReuseDepth}`,
          );
        }
      }

      if (options.terminal) return { linesBefore, linesAfter: [] };

      const linesAfter = await engine.analyze(fenAfter, config.postAnalyze);
      return { linesBefore, linesAfter };
    });
    const moveBarrier = operation.then(
      () => undefined,
      () => undefined,
    );
    moveAnalysis = moveBarrier;
    try {
      return await operation;
    } finally {
      if (moveAnalysis === moveBarrier) moveAnalysis = null;
    }
  };

  const reset = async (): Promise<void> => {
    const activeMove = moveAnalysis;
    if (activeMove) await activeMove;
    preAnalysis = null;
    await engine.newGame();
  };

  const dispose = (): void => {
    disposed = true;
    preAnalysis = null;
    void engine.stop().catch(() => undefined);
  };

  return { preAnalyze, analyzeKidMove, reset, dispose };
}
