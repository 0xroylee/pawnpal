import { readFile, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../src/shared/coach/types.ts";
import type { FactKind } from "../../src/shared/coach/types.ts";
import { createEngineClient } from "../../src/web/engine/EngineClient.js";
import { NodeStockfishTransport } from "../../src/web/engine/nodeTransport.js";
import { gradeMove } from "../../src/web/coach/grade.js";
import {
  buildContext,
  runDetectors,
} from "../../src/web/coach/detectors/index.js";
import { mirrorFen, mirrorSan, mirrorUci } from "../unit/coach/mirror.js";

type RecordedAnalysis = {
  linesBefore: EngineLine[];
  linesAfter: EngineLine[];
  depths: { before: number[]; after: number[] };
};

type Fixture = {
  id: string;
  fen: string;
  move: string;
  kidColor: "w" | "b";
  smoke?: boolean;
  expect?: { kinds: FactKind[]; mirroredKinds: FactKind[] };
  recorded?: { white: RecordedAnalysis; mirrored: RecordedAnalysis };
};

const fixtureSets = [
  {
    url: new URL("../fixtures/coach/grading.json", import.meta.url),
    fixtures: JSON.parse(
      await readFile(
        new URL("../fixtures/coach/grading.json", import.meta.url),
        "utf8",
      ),
    ) as Fixture[],
  },
  {
    url: new URL("../fixtures/coach/detectors.json", import.meta.url),
    fixtures: JSON.parse(
      await readFile(
        new URL("../fixtures/coach/detectors.json", import.meta.url),
        "utf8",
      ),
    ) as Fixture[],
  },
];
const shouldRecord = process.env.PAWNPAL_RECORD_FIXTURES === "1";
const verifyAll = process.env.PAWNPAL_ENGINE_FIXTURES === "1";

describe("Node Stockfish coach fixtures", () => {
  if (shouldRecord) {
    it("records fixtures with Stockfish lite-single at fixed depth", async () => {
      const engine = createEngineClient(new NodeStockfishTransport(), {
        threads: 1,
      });
      await engine.init();
      try {
        for (const set of fixtureSets) {
          let changed = false;
          for (const fixture of set.fixtures) {
            if (fixture.recorded) continue;
            try {
              const originalMove = new Chess(fixture.fen).move({
                from: fixture.move.slice(0, 2),
                to: fixture.move.slice(2, 4),
                ...(fixture.move[4] ? { promotion: fixture.move[4] } : {}),
              });
              const mirrored = {
                fen: mirrorFen(fixture.fen),
                move: mirrorUci(fixture.move),
                san: mirrorSan(fixture.fen, originalMove.san),
              };
              fixture.recorded = {
                white: await recordPosition(
                  engine,
                  fixture.fen,
                  fixture.move,
                  originalMove.san,
                ),
                mirrored: await recordPosition(
                  engine,
                  mirrored.fen,
                  mirrored.move,
                  mirrored.san,
                ),
              };
            } catch (error) {
              throw new Error(`Could not record fixture ${fixture.id}`, {
                cause: error,
              });
            }
            changed = true;
          }
          if (changed) {
            await writeFile(
              set.url,
              `${JSON.stringify(set.fixtures, null, 2)}\n`,
              "utf8",
            );
          }
        }
      } finally {
        engine.terminate();
      }
    }, 600_000);
  } else {
    it(`replays ${verifyAll ? "all" : "smoke"} recorded fixtures deterministically`, async () => {
      const selected = verifyAll
        ? fixtureSets.flatMap((set) => set.fixtures)
        : fixtureSets.flatMap((set) =>
            set.fixtures.filter((fixture) => fixture.smoke),
          );
      expect(selected.length).toBeGreaterThan(0);
      const engine = createEngineClient(new NodeStockfishTransport(), {
        threads: 1,
      });
      await engine.init();
      try {
        for (const fixture of selected) {
          if (!fixture.recorded) {
            throw new Error(`Fixture ${fixture.id} has not been recorded`);
          }
          const move = new Chess(fixture.fen).move({
            from: fixture.move.slice(0, 2),
            to: fixture.move.slice(2, 4),
            ...(fixture.move[4] ? { promotion: fixture.move[4] } : {}),
          });
          const mirrored = {
            fen: mirrorFen(fixture.fen),
            move: mirrorUci(fixture.move),
            san: mirrorSan(fixture.fen, move.san),
          };
          const actualWhite = await recordPosition(
            engine,
            fixture.fen,
            fixture.move,
            move.san,
          );
          const actualMirrored = await recordPosition(
            engine,
            mirrored.fen,
            mirrored.move,
            mirrored.san,
          );
          expect(comparable(actualWhite)).toEqual(
            comparable(fixture.recorded.white),
          );
          expect(comparable(actualMirrored)).toEqual(
            comparable(fixture.recorded.mirrored),
          );
        }
      } finally {
        engine.terminate();
      }
    }, 600_000);
  }
});

describe("recorded detector expectations", () => {
  it("includes the recorded missed-fork E2E fixture in expect.kinds", () => {
    const fixture = fixtureSets[1]!.fixtures.find(
      ({ id }) => id === "missed-fork-e2e-1",
    );
    expect(fixture).toBeDefined();
    expect(fixture?.expect?.kinds).toContain("missed-fork");
    if (!fixture?.recorded) {
      throw new Error("Fixture missed-fork-e2e-1 has not been recorded");
    }
    expect(
      selectedKinds(
        fixture.fen,
        fixture.move,
        fixture.kidColor,
        fixture.recorded.white,
      ),
    ).toEqual(fixture.expect!.kinds);
    expect(
      selectedKinds(
        mirrorFen(fixture.fen),
        mirrorUci(fixture.move),
        fixture.kidColor === "w" ? "b" : "w",
        fixture.recorded.mirrored,
      ),
    ).toEqual(fixture.expect!.mirroredKinds);
  });
});

async function recordPosition(
  engine: ReturnType<typeof createEngineClient>,
  fen: string,
  uci: string,
  expectedSan: string,
): Promise<RecordedAnalysis> {
  await engine.newGame();
  const linesBefore = truncateLines(
    await engine.analyze(fen, { depth: 14, multiPv: 3 }),
  );
  const after = new Chess(fen);
  const move = after.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  });
  expect(move.san).toBe(expectedSan);
  await engine.newGame();
  const linesAfter = truncateLines(
    await engine.analyze(after.fen(), { depth: 12, multiPv: 2 }),
  );
  return {
    linesBefore,
    linesAfter,
    depths: {
      before: linesBefore.map((line) => line.depth),
      after: linesAfter.map((line) => line.depth),
    },
  };
}

function selectedKinds(
  fen: string,
  uci: string,
  kidColor: "w" | "b",
  recorded: RecordedAnalysis,
): FactKind[] {
  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] } : {}),
  });
  const analysis = gradeMove({
    ply: 1,
    fenBefore: fen,
    move: { uci, san: move.san },
    kidColor,
    linesBefore: recorded.linesBefore,
    linesAfter: recorded.linesAfter,
  });
  return runDetectors(buildContext({ analysis, kidColor })).map(
    (fact) => fact.kind,
  );
}

function truncateLines(lines: EngineLine[]): EngineLine[] {
  return lines.map((line) => ({ ...line, pv: line.pv.slice(0, 8) }));
}

function comparable(analysis: RecordedAnalysis) {
  return {
    linesBefore: comparableLines(analysis.linesBefore),
    linesAfter: comparableLines(analysis.linesAfter),
    depths: analysis.depths,
  };
}

function comparableLines(lines: EngineLine[]) {
  return lines.map((line) => ({
    uci: line.uci,
    ...(line.cp !== undefined ? { cp: line.cp } : {}),
    ...(line.mate !== undefined ? { mate: line.mate } : {}),
    pv: line.pv.slice(0, 8),
    depth: line.depth,
  }));
}
