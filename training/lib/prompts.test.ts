import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { createLlmClient } from "../../src/server/llm/client.js";
import { mockOpenAi } from "../../src/server/llm/mockOpenAi.js";
import { buildRephraseRequest } from "../../src/shared/coach/promptBuilder.ts";
import { finalizeFact, type EngineLine } from "../../src/shared/coach/types.ts";
import { shouldCallLlm } from "../../src/shared/coach/rephrasePolicy.ts";
import {
  buildContext,
  runDetectors,
} from "../../src/web/coach/detectors/index.js";
import { gradeMove } from "../../src/web/coach/grade.js";
import { buildPromptRecords } from "./prompts.ts";
import type { PositionRecord } from "./positions.ts";

const detectorFixturePath = fileURLToPath(
  new URL("../../tests/fixtures/coach/detectors.json", import.meta.url),
);

type DetectorFixture = {
  id: string;
  fen: string;
  move: string;
  recorded?: {
    white: { linesBefore: EngineLine[]; linesAfter: EngineLine[] };
  };
};

async function fixturePosition(
  id: string,
  grade: PositionRecord["grade"],
  isOnlyMove = false,
): Promise<PositionRecord> {
  const fixtures = JSON.parse(
    await readFile(detectorFixturePath, "utf8"),
  ) as DetectorFixture[];
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture?.recorded) throw new Error(`Missing recording for ${id}`);

  const board = new Chess(fixture.fen);
  const move = board.move({
    from: fixture.move.slice(0, 2),
    to: fixture.move.slice(2, 4),
    ...(fixture.move[4] ? { promotion: fixture.move[4] } : {}),
  });
  const analysis = gradeMove({
    ply: 1,
    fenBefore: fixture.fen,
    move: { uci: fixture.move, san: move.san },
    kidColor: "w",
    linesBefore: fixture.recorded.white.linesBefore,
    linesAfter: fixture.recorded.white.linesAfter,
  });
  const facts = runDetectors(buildContext({ analysis, kidColor: "w" }));

  return {
    gameId: fixture.id,
    ply: 1,
    kidColor: "w",
    fenBefore: fixture.fen,
    moveUci: fixture.move,
    moveSan: move.san,
    grade,
    isOnlyMove,
    winBefore: analysis.winBefore,
    winAfter: analysis.winAfter,
    drop: analysis.drop,
    facts,
    linesBefore: fixture.recorded.white.linesBefore,
    linesAfter: fixture.recorded.white.linesAfter,
    ratings: { whiteElo: 900, blackElo: 1300 },
  };
}

describe("buildPromptRecords", () => {
  it("builds deterministic fact-backed requests byte-equal to inference", async () => {
    const positions = await Promise.all([
      fixturePosition("allowed-fork-1", "mistake"),
      fixturePosition("played-fork-1", "best", true),
      fixturePosition("missed-mate-3", "blunder"),
    ]);
    const options = {
      model: "fixture-model",
      ages: [6, 8, 11] as [6, 8, 11],
      variantSeed: 13,
    };
    const records = positions.flatMap((position) =>
      buildPromptRecords(position, options),
    );
    const repeated = positions.flatMap((position) =>
      buildPromptRecords(position, options),
    );
    const modes = new Set(records.map((record) => record.mode));
    const mock = mockOpenAi();
    const client = createLlmClient({
      baseUrl: "http://mock.local/v1",
      fetch: mock.app.request.bind(mock.app),
    });

    expect(records.length).toBeGreaterThan(0);
    expect(records.map((record) => record.requestJson)).toEqual(
      repeated.map((record) => record.requestJson),
    );
    expect([...modes]).toEqual(
      expect.arrayContaining(["nudge", "explain", "reveal", "praise", "hint"]),
    );

    for (const record of records) {
      expect(record.requestJson).toBe(JSON.stringify(record.request));
      expect(record.requestJson).toBe(
        JSON.stringify(
          buildRephraseRequest(
            {
              fact: record.fact,
              mode: record.mode,
              templateText: record.templateText,
              kidColor: record.kidColor,
              kidAge: record.kidAge,
              language: "en",
            },
            { model: options.model },
          ),
        ),
      );
      await client.chat(record.request);
      expect(mock.requests.at(-1)?.body).toBe(record.requestJson);
    }
  });

  it("omits no-fact positions from teacher requests", async () => {
    const position = await fixturePosition("allowed-fork-1", "good");
    const noFactPosition = { ...position, facts: [], linesBefore: [] };

    expect(
      buildPromptRecords(noFactPosition, {
        model: "fixture-model",
        ages: [6, 8, 11],
        variantSeed: 1,
      }),
    ).toEqual([]);
  });

  it("omits the castling nudge preflight records that inference does not send", async () => {
    const base = await fixturePosition("allowed-fork-1", "mistake");
    const castlingFact = finalizeFact({
      kind: "hanging-piece",
      betterMover: { type: "k", color: "w", square: "e1" },
      betterMoveSan: "O-O",
      betterMoveUci: "e1g1",
    });
    const records = buildPromptRecords(
      { ...base, facts: [castlingFact], linesBefore: [] },
      { model: "fixture-model", ages: [6, 8, 11], variantSeed: 2 },
    );
    const included = records.filter((record) =>
      shouldCallLlm({
        fact: record.fact,
        mode: record.mode,
        templateText: record.templateText,
        kidColor: record.kidColor,
        kidAge: record.kidAge,
        language: "en",
      }),
    );
    const omitted = records.filter((record) => !included.includes(record));

    expect(records.map((record) => record.mode)).toEqual([
      "nudge",
      "explain",
      "reveal",
      "nudge",
      "explain",
      "reveal",
      "nudge",
      "explain",
      "reveal",
    ]);
    expect(omitted.map((record) => record.mode)).toEqual([
      "nudge",
      "nudge",
      "nudge",
    ]);
    expect(included.map((record) => record.mode)).not.toContain("nudge");
  });
});
