import { readFileSync } from "node:fs";
import { Chess } from "chess.js";
import type { EngineLine } from "../../src/shared/coach/types.js";
import type { ReplayRecording } from "../../src/web/engine/replayTransport.js";

type DetectorFixture = {
  id: string;
  fen: string;
  move: string;
  kidColor: "w" | "b";
  recorded?: {
    white: { linesBefore: EngineLine[]; linesAfter: EngineLine[] };
  };
};

const fixtures = JSON.parse(
  readFileSync(
    new URL("../fixtures/coach/detectors.json", import.meta.url),
    "utf8",
  ),
) as DetectorFixture[];

export function loadDetectorFixture(id: string): DetectorFixture {
  const fixture = fixtures.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown detector fixture: ${id}`);
  return fixture;
}

export function recordingFor(fixture: DetectorFixture): ReplayRecording {
  const recorded = fixture.recorded?.white;
  if (!recorded)
    throw new Error(`Fixture ${fixture.id} has no white recording`);

  const after = new Chess(fixture.fen);
  after.move({
    from: fixture.move.slice(0, 2),
    to: fixture.move.slice(2, 4),
    ...(fixture.move[4] ? { promotion: fixture.move[4] } : {}),
  });

  return {
    positions: [
      { fen: fixture.fen, lines: recorded.linesBefore },
      { fen: after.fen(), lines: recorded.linesAfter },
    ],
  };
}
