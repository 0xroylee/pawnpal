import { describe, expect, it, vi } from "vitest";
import type { EngineLine } from "../../shared/coach/types.ts";
import { defaultGradeConfig } from "./gradeConfig.js";
import {
  createAnalysisPipeline,
  type AnalystLike,
} from "./analysisPipeline.js";

const lines = (depth: number): EngineLine[] => [
  { uci: "e2e4", san: "e4", cp: 10, pv: ["e2e4"], depth },
  { uci: "d2d4", san: "d4", cp: 5, pv: ["d2d4"], depth },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function analyst(analyze: AnalystLike["analyze"]): AnalystLike {
  return {
    analyze: vi.fn(analyze),
    stop: vi.fn().mockResolvedValue(undefined),
    newGame: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createAnalysisPipeline", () => {
  it("reuses a pre-analysis that reached depth 8 and analyzes the reply position", async () => {
    const pre = deferred<EngineLine[]>();
    const engine = analyst(
      vi.fn().mockReturnValueOnce(pre.promise).mockResolvedValueOnce(lines(12)),
    );
    vi.mocked(engine.stop).mockImplementation(async () => {
      pre.resolve(lines(9));
      await pre.promise;
    });
    const pipeline = createAnalysisPipeline(engine);

    const preAnalysis = pipeline.preAnalyze("fen-before");
    const moveAnalysis = pipeline.analyzeKidMove("fen-before", "fen-after");
    await expect(preAnalysis).resolves.toEqual(lines(9));
    await expect(moveAnalysis).resolves.toEqual({
      linesBefore: lines(9),
      linesAfter: lines(12),
    });
    expect(engine.stop).toHaveBeenCalledOnce();
    expect(engine.analyze).toHaveBeenNthCalledWith(
      1,
      "fen-before",
      defaultGradeConfig.analysis.preAnalyze,
    );
    expect(engine.analyze).toHaveBeenNthCalledWith(
      2,
      "fen-after",
      defaultGradeConfig.analysis.postAnalyze,
    );
  });

  it("re-runs the before position when stopped pre-analysis is shallower than depth 8", async () => {
    const pre = deferred<EngineLine[]>();
    const engine = analyst(
      vi
        .fn()
        .mockReturnValueOnce(pre.promise)
        .mockResolvedValueOnce(lines(8))
        .mockResolvedValueOnce(lines(12)),
    );
    vi.mocked(engine.stop).mockImplementation(async () => {
      pre.resolve(lines(6));
      await pre.promise;
    });
    const pipeline = createAnalysisPipeline(engine);

    pipeline.preAnalyze("fen-before");
    const moveAnalysis = pipeline.analyzeKidMove("fen-before", "fen-after");
    await expect(moveAnalysis).resolves.toMatchObject({
      linesBefore: lines(8),
      linesAfter: lines(12),
    });
    expect(engine.analyze).toHaveBeenNthCalledWith(
      2,
      "fen-before",
      defaultGradeConfig.analysis.fallback,
    );
  });

  it("rejects a fallback result that does not reach the minimum depth", async () => {
    const engine = analyst(vi.fn().mockResolvedValueOnce(lines(6)));
    const pipeline = createAnalysisPipeline(engine);

    await expect(
      pipeline.analyzeKidMove("fen-before", "fen-after"),
    ).rejects.toThrow("Fallback analysis did not reach depth 8");
    expect(engine.analyze).toHaveBeenCalledOnce();
  });

  it("skips the post-move search for a terminal move", async () => {
    const engine = analyst(vi.fn().mockResolvedValueOnce(lines(8)));
    const pipeline = createAnalysisPipeline(engine);

    await expect(
      pipeline.analyzeKidMove("fen-before", "fen-after", { terminal: true }),
    ).resolves.toEqual({ linesBefore: lines(8), linesAfter: [] });
    expect(engine.analyze).toHaveBeenCalledOnce();
    expect(engine.analyze).toHaveBeenCalledWith(
      "fen-before",
      defaultGradeConfig.analysis.fallback,
    );
  });

  it("keeps the engine reserved through fallback and post-move analysis", async () => {
    const fallback = deferred<EngineLine[]>();
    const post = deferred<EngineLine[]>();
    const engine = analyst(
      vi.fn((fen) => {
        if (fen === "fen-before") return fallback.promise;
        if (fen === "fen-after") return post.promise;
        return Promise.resolve(lines(14));
      }),
    );
    const pipeline = createAnalysisPipeline(engine);

    const moveAnalysis = pipeline.analyzeKidMove("fen-before", "fen-after");
    await vi.waitFor(() => expect(engine.analyze).toHaveBeenCalledTimes(1));
    expect(engine.analyze).toHaveBeenNthCalledWith(
      1,
      "fen-before",
      defaultGradeConfig.analysis.fallback,
    );

    const nextPreAnalysis = pipeline.preAnalyze("next-fen");
    expect(engine.analyze).toHaveBeenCalledTimes(1);
    expect(engine.stop).not.toHaveBeenCalled();

    fallback.resolve(lines(8));
    await vi.waitFor(() => expect(engine.analyze).toHaveBeenCalledTimes(2));
    expect(engine.analyze).toHaveBeenNthCalledWith(
      2,
      "fen-after",
      defaultGradeConfig.analysis.postAnalyze,
    );
    expect(engine.stop).not.toHaveBeenCalled();

    post.resolve(lines(12));
    await expect(moveAnalysis).resolves.toMatchObject({
      linesBefore: lines(8),
      linesAfter: lines(12),
    });
    await expect(nextPreAnalysis).resolves.toEqual(lines(14));
    expect(engine.analyze).toHaveBeenNthCalledWith(
      3,
      "next-fen",
      defaultGradeConfig.analysis.preAnalyze,
    );
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it("waits for a post-move analysis before starting the next pre-analysis", async () => {
    const post = deferred<EngineLine[]>();
    const engine = analyst(
      vi
        .fn()
        .mockResolvedValueOnce(lines(9))
        .mockReturnValueOnce(post.promise)
        .mockResolvedValueOnce(lines(14)),
    );
    const pipeline = createAnalysisPipeline(engine);

    await pipeline.preAnalyze("fen-before");
    const moveAnalysis = pipeline.analyzeKidMove("fen-before", "fen-after");
    await vi.waitFor(() => expect(engine.analyze).toHaveBeenCalledTimes(2));
    const nextPreAnalysis = pipeline.preAnalyze("next-fen");
    expect(engine.analyze).toHaveBeenCalledTimes(2);
    expect(engine.stop).not.toHaveBeenCalled();

    post.resolve(lines(12));
    await expect(moveAnalysis).resolves.toMatchObject({
      linesAfter: lines(12),
    });
    await expect(nextPreAnalysis).resolves.toEqual(lines(14));
    expect(engine.analyze).toHaveBeenNthCalledWith(
      3,
      "next-fen",
      defaultGradeConfig.analysis.preAnalyze,
    );
  });

  it("resets cached analysis with a new engine game", async () => {
    const engine = analyst(
      vi
        .fn()
        .mockResolvedValueOnce(lines(9))
        .mockResolvedValueOnce(lines(8))
        .mockResolvedValueOnce(lines(12)),
    );
    const pipeline = createAnalysisPipeline(engine);
    await pipeline.preAnalyze("fen-before");
    await pipeline.reset();
    await pipeline.analyzeKidMove("fen-before", "fen-after");

    expect(engine.newGame).toHaveBeenCalledOnce();
    expect(engine.analyze).toHaveBeenNthCalledWith(
      2,
      "fen-before",
      defaultGradeConfig.analysis.fallback,
    );
  });
});
