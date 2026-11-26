import {
  createVariantPicker,
  renderMessage,
  type VariantPicker,
} from "../../src/web/coach/templates.js";
import { selectFact } from "../../src/web/coach/detectors/priority.js";
import {
  buildContext,
  runDetectors,
} from "../../src/web/coach/detectors/index.js";
import {
  isCoachedGrade,
  type CoachFact,
  type RephraseMode,
} from "../../src/shared/coach/types.ts";
import {
  buildRephraseRequest,
  type ChatCompletionRequest,
} from "../../src/shared/coach/promptBuilder.ts";
import type { PositionRecord } from "./positions.ts";

export type PromptRecord = {
  id: string;
  gameId: string;
  ply: number;
  mode: RephraseMode;
  kidAge: number;
  kidColor: PositionRecord["kidColor"];
  fact: CoachFact;
  templateText: string;
  request: ChatCompletionRequest;
  requestJson: string;
};

export type BuildPromptOptions = {
  model: string;
  ages: [number, number, number];
  variantSeed: number;
};

type TemplateMode = "nudge" | "explain" | "reveal" | "praise" | "hint2";

export function buildPromptRecords(
  position: PositionRecord,
  options: BuildPromptOptions,
): PromptRecord[] {
  const picker = createVariantPicker(
    seededRandom(`${options.variantSeed}:${position.gameId}:${position.ply}`),
  );
  const selectedFact = selectFact(position.facts);
  const praiseFact = position.facts.find((fact) => fact.kind === "played-fork");
  const hintFact = position.linesBefore[0]
    ? selectFact(
        runDetectors(
          buildContext({
            analysis: { fen: position.fenBefore, lines: position.linesBefore },
            kidColor: position.kidColor,
          }),
        ),
      )
    : undefined;
  const records: PromptRecord[] = [];

  for (const kidAge of options.ages) {
    if (isCoachedGrade(position.grade) && selectedFact) {
      for (const mode of ["nudge", "explain", "reveal"] as const) {
        records.push(
          makePromptRecord(
            position,
            selectedFact,
            mode,
            mode,
            kidAge,
            picker,
            options.model,
          ),
        );
      }
    }

    if ((position.isOnlyMove || praiseFact) && praiseFact) {
      records.push(
        makePromptRecord(
          position,
          praiseFact,
          "praise",
          "praise",
          kidAge,
          picker,
          options.model,
        ),
      );
    }

    if (hintFact) {
      records.push(
        makePromptRecord(
          position,
          hintFact,
          "hint",
          "hint2",
          kidAge,
          picker,
          options.model,
        ),
      );
    }
  }

  return records;
}

function makePromptRecord(
  position: PositionRecord,
  fact: CoachFact,
  mode: RephraseMode,
  templateMode: TemplateMode,
  kidAge: number,
  picker: VariantPicker,
  model: string,
): PromptRecord {
  const templateText = renderTemplate(position, fact, templateMode, picker);
  const input = {
    fact,
    mode,
    templateText,
    kidColor: position.kidColor,
    kidAge,
    language: "en" as const,
  };
  const request = buildRephraseRequest(input, { model });

  return {
    id: `${position.gameId}:${position.ply}:${mode}:${kidAge}`,
    gameId: position.gameId,
    ply: position.ply,
    mode,
    kidAge,
    kidColor: position.kidColor,
    fact,
    templateText,
    request,
    requestJson: JSON.stringify(request),
  };
}

function renderTemplate(
  position: PositionRecord,
  fact: CoachFact,
  mode: TemplateMode,
  picker: VariantPicker,
): string {
  return renderMessage({
    kind: fact.kind,
    mode,
    fact,
    playedMoveUci: position.moveUci,
    picker,
    kidColor: position.kidColor,
  }).text;
}

function seededRandom(seed: string): () => number {
  let state = 0x811c9dc5;
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 0x01000193);
  }

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
