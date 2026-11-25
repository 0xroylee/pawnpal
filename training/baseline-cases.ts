import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Chess } from "chess.js";
import type {
  CoachFact,
  EngineLine,
  RephraseMode,
  RephraseRequestInput,
} from "../src/shared/coach/types.ts";
import {
  buildContext,
  runDetectors,
} from "../src/web/coach/detectors/index.ts";
import { gradeMove } from "../src/web/coach/grade.ts";
import { messageKeys, renderMessage } from "../src/web/coach/templates.ts";
import { mirrorFen, mirrorUci } from "../tests/unit/coach/mirror.ts";

const fixtureFiles = [
  "tests/fixtures/coach/detectors.json",
  "tests/fixtures/coach/grading.json",
] as const;
const modes = ["praise", "nudge", "explain", "reveal", "hint"] as const;
const ages = [6, 8, 11] as const;
const caseCount = 100;

type RecordedPosition = { linesBefore: EngineLine[]; linesAfter: EngineLine[] };
type Fixture = {
  id: string;
  fen: string;
  move: string;
  recorded: { white: RecordedPosition; mirrored: RecordedPosition };
};

type FixtureFact = {
  id: string;
  fixtureId: string;
  mirrored: boolean;
  fact: CoachFact;
  kidColor: RephraseRequestInput["kidColor"];
  playedMoveUci: string;
};

export type BaselineCase = Pick<
  FixtureFact,
  "id" | "fixtureId" | "mirrored"
> & {
  input: RephraseRequestInput;
};

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function loadBaselineCases() {
  const sources = await Promise.all(
    fixtureFiles.map(async (path) => {
      const text = await readFile(path, "utf8");
      return {
        path,
        sha256: sha256(text),
        fixtures: JSON.parse(text) as Fixture[],
      };
    }),
  );
  const facts = sources.flatMap(({ fixtures }) =>
    fixtures.flatMap((fixture) => [
      ...replay(fixture, false),
      ...replay(fixture, true),
    ]),
  );
  facts.sort((left, right) => left.id.localeCompare(right.id, "en"));
  const cases: BaselineCase[] = [];
  const selected = new Set<string>();
  while (cases.length < caseCount) {
    const previousCount = cases.length;
    for (const mode of modes) {
      if (cases.length === caseCount) break;
      const candidate = facts.find(
        (item) => !selected.has(item.id) && supportsMode(item.fact, mode),
      );
      if (!candidate) continue;
      selected.add(candidate.id);
      const { id, fixtureId, mirrored, fact, kidColor, playedMoveUci } =
        candidate;
      const { text: templateText } = renderMessage({
        kind: fact.kind,
        mode: mode === "hint" ? "hint2" : mode,
        fact,
        playedMoveUci,
        kidColor,
      });
      cases.push({
        id,
        fixtureId,
        mirrored,
        input: {
          fact,
          mode,
          templateText,
          kidColor,
          kidAge: ages[cases.length % ages.length],
          language: "en",
        },
      });
    }
    if (cases.length === previousCount) {
      throw new Error(
        `Only ${cases.length} distinct facts support the benchmark`,
      );
    }
  }

  if (
    new Set(cases.map(({ input }) => input.mode)).size !== modes.length ||
    new Set(cases.map(({ input }) => input.kidColor)).size !== 2
  ) {
    throw new Error("The benchmark needs cases for every mode and both colors");
  }

  return {
    cases,
    fixtures: sources.map(({ path, sha256 }) => ({ path, sha256 })),
  };
}

function replay(fixture: Fixture, mirrored: boolean): FixtureFact[] {
  const fenBefore = mirrored ? mirrorFen(fixture.fen) : fixture.fen;
  const uci = mirrored ? mirrorUci(fixture.move) : fixture.move;
  const position = new Chess(fenBefore);
  const kidColor = position.turn();
  const { san } = position.move(uci);
  const { linesBefore, linesAfter } = mirrored
    ? fixture.recorded.mirrored
    : fixture.recorded.white;
  const analysis = gradeMove({
    ply: 1,
    fenBefore,
    move: { uci, san },
    kidColor,
    linesBefore,
    linesAfter,
  });
  return runDetectors(buildContext({ analysis, kidColor })).map((fact) => ({
    id: sha256(JSON.stringify(fact)),
    fixtureId: fixture.id,
    mirrored,
    fact,
    kidColor,
    playedMoveUci: uci,
  }));
}

function supportsMode(fact: CoachFact, mode: RephraseMode): boolean {
  if ((fact.kind === "played-fork") !== (mode === "praise")) return false;
  // The app intentionally avoids sending castling nudges and hints to a model.
  if (
    (mode === "nudge" || mode === "hint") &&
    fact.betterMoveSan?.startsWith("O-O")
  ) {
    return false;
  }
  return messageKeys(fact.kind, mode === "hint" ? "hint2" : mode).length > 0;
}
