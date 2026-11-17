import { readFile, writeFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../src/shared/coach/types.ts";
import { createEngineClient } from "../../src/web/engine/EngineClient.js";
import { NodeStockfishTransport } from "../../src/web/engine/nodeTransport.js";
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
  expect: { grade: string; isOnlyMove?: boolean; cappedByWinning?: boolean };
  tags: string[];
  smoke?: boolean;
  recorded?: { white: RecordedAnalysis; mirrored: RecordedAnalysis };
};

const fixturesUrl = new URL("../fixtures/coach/grading.json", import.meta.url);
const fixtures = JSON.parse(await readFile(fixturesUrl, "utf8")) as Fixture[];
const shouldRecord = process.env.PAWNPAL_RECORD_FIXTURES === "1";
const verifyAll = process.env.PAWNPAL_ENGINE_FIXTURES === "1";

describe("Node Stockfish grading fixtures", () => {
  if (shouldRecord) {
    it("records fixtures with Stockfish lite-single at fixed depth", async () => {
      const engine = createEngineClient(new NodeStockfishTransport(), {
        threads: 1,
      });
      await engine.init();
      try {
        for (const fixture of fixtures) {
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
        }
        await writeFile(
          fixturesUrl,
          `${JSON.stringify(fixtures, null, 2)}\n`,
          "utf8",
        );
      } finally {
        engine.terminate();
      }
    }, 600_000);
  } else {
    it(`replays ${verifyAll ? "all" : "smoke"} recorded fixtures deterministically`, async () => {
      const selected = verifyAll
        ? fixtures
        : fixtures.filter((fixture) => fixture.smoke);
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
