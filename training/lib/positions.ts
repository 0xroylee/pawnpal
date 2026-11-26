import { Chess, type Color, type Move } from "chess.js";
import type {
  CoachFact,
  EngineLine,
  MoveAnalysis,
} from "../../src/shared/coach/types.ts";
import { COACH_FACT_SCHEMA_VERSION } from "../../src/shared/coach/types.ts";
import type { EngineClient } from "../../src/web/engine/EngineClient.js";
import {
  buildContext,
  runDetectors,
} from "../../src/web/coach/detectors/index.js";
import { gradeMove } from "../../src/web/coach/grade.js";
import type { MoveEnding } from "../../src/web/game/reducer.js";
import type { PgnGame } from "./pgnStream.ts";

export type PositionAnalysisOptions = {
  depthBefore: number;
  multiPvBefore: number;
  depthAfter: number;
  multiPvAfter: number;
  pvPlies: number;
};

export const DEFAULT_POSITION_ANALYSIS: PositionAnalysisOptions = {
  depthBefore: 14,
  multiPvBefore: 3,
  depthAfter: 12,
  multiPvAfter: 2,
  pvPlies: 8,
};

export type PositionRecord = {
  gameId: string;
  ply: number;
  kidColor: Color;
  fenBefore: string;
  moveUci: string;
  moveSan: string;
  grade: MoveAnalysis["grade"];
  isOnlyMove: boolean;
  winBefore: number;
  winAfter: number;
  drop: number;
  facts: CoachFact[];
  linesBefore: EngineLine[];
  linesAfter: EngineLine[];
  ratings: { whiteElo?: number; blackElo?: number };
};

export class InvalidPgnError extends Error {
  constructor(gameId: string, cause: unknown) {
    super(`Could not load PGN game ${gameId}`, { cause });
    this.name = "InvalidPgnError";
  }
}

function ratedKidColors(game: PgnGame): Set<Color> {
  const colors = new Set<Color>();
  if (
    game.whiteElo !== undefined &&
    game.whiteElo >= 600 &&
    game.whiteElo <= 1400
  ) {
    colors.add("w");
  }
  if (
    game.blackElo !== undefined &&
    game.blackElo >= 600 &&
    game.blackElo <= 1400
  ) {
    colors.add("b");
  }
  return colors;
}

function moveEnding(chess: Chess): MoveEnding | undefined {
  if (chess.isCheckmate()) return "checkmate";
  if (chess.isStalemate()) return "stalemate";
  if (chess.isThreefoldRepetition()) return "threefold";
  if (chess.isDrawByFiftyMoves()) return "fifty-move";
  if (chess.isInsufficientMaterial()) return "insufficient";
  return undefined;
}

function truncateLines(lines: EngineLine[], pvPlies: number): EngineLine[] {
  return lines.map((line) => ({ ...line, pv: line.pv.slice(0, pvPlies) }));
}

export async function* analyzeGame(
  game: PgnGame,
  engine: Pick<EngineClient, "analyze" | "newGame">,
  options: PositionAnalysisOptions = DEFAULT_POSITION_ANALYSIS,
): AsyncGenerator<PositionRecord> {
  const parsed = new Chess();
  let moves: Move[];
  try {
    parsed.loadPgn(game.pgn);
    moves = parsed.history({ verbose: true });
  } catch (error) {
    throw new InvalidPgnError(game.id, error);
  }

  let board: Chess;
  try {
    board = game.headers.FEN ? new Chess(game.headers.FEN) : new Chess();
  } catch (error) {
    throw new InvalidPgnError(game.id, error);
  }

  const kidColors = ratedKidColors(game);
  for (const [index, move] of moves.entries()) {
    const fenBefore = board.fen();
    const moveUci = `${move.from}${move.to}${move.promotion ?? ""}`;
    const after = new Chess(fenBefore);
    after.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });

    if (kidColors.has(move.color)) {
      await engine.newGame();
      const linesBefore = truncateLines(
        await engine.analyze(fenBefore, {
          depth: options.depthBefore,
          multiPv: options.multiPvBefore,
        }),
        options.pvPlies,
      );

      const ending = moveEnding(after);
      let linesAfter: EngineLine[] = [];
      if (!ending) {
        await engine.newGame();
        linesAfter = truncateLines(
          await engine.analyze(after.fen(), {
            depth: options.depthAfter,
            multiPv: options.multiPvAfter,
          }),
          options.pvPlies,
        );
      }

      const analysis = gradeMove({
        ply: index + 1,
        fenBefore,
        move: { uci: moveUci, san: move.san },
        kidColor: move.color,
        linesBefore,
        linesAfter,
        ...(ending ? { ending } : {}),
      });
      const facts = runDetectors(
        buildContext({ analysis, kidColor: move.color }),
      ).map((fact) => ({
        ...fact,
        schemaVersion: COACH_FACT_SCHEMA_VERSION,
      }));

      yield {
        gameId: game.id,
        ply: index + 1,
        kidColor: move.color,
        fenBefore,
        moveUci,
        moveSan: move.san,
        grade: analysis.grade,
        isOnlyMove: analysis.isOnlyMove,
        winBefore: analysis.winBefore,
        winAfter: analysis.winAfter,
        drop: analysis.drop,
        facts,
        linesBefore,
        linesAfter,
        ratings: {
          ...(game.whiteElo === undefined ? {} : { whiteElo: game.whiteElo }),
          ...(game.blackElo === undefined ? {} : { blackElo: game.blackElo }),
        },
      };
    }

    board = after;
  }
}
