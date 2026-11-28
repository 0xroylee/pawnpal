import { PIECE_WORDS } from "./pieceWords.ts";
import type { CoachFact, RephraseRequestInput } from "./types.ts";

export type ChatCompletionMessage =
  { role: "system"; content: string } | { role: "user"; content: string };

export type ChatCompletionRequest = {
  model: string;
  messages: [ChatCompletionMessage, ChatCompletionMessage];
  temperature: 0.6;
  max_tokens: 120;
  stream: false;
  reasoning_effort?: "none";
};

// Version 2 was retired.
export type PromptVersion = 1 | 3;
export const PROMPT_VERSION: PromptVersion = 1;

const MODE_RULES = {
  nudge: "Do not reveal the better move.",
  explain: "Say what happens next in plain words.",
  reveal: "You may name the better move exactly as it appears in the facts.",
  praise: "Keep it to one cheerful sentence.",
  hint: "Do not reveal the move; point the child at the piece.",
} as const;

export function buildRephraseRequest(
  input: RephraseRequestInput,
  options: { model: string; promptVersion?: PromptVersion },
): ChatCompletionRequest {
  const age = input.kidAge ?? "about 8";
  const systemContent =
    `You are Pip, a friendly chess coach talking to a child aged ${age}. ` +
    "Rewrite the coach note for the child in at most two short sentences. " +
    "Use only the facts given. Never mention a move, square or piece that isn't in the facts. " +
    "No numbers, no evaluations, no notation unless it's listed in the facts. " +
    MODE_RULES[input.mode];
  const version = options.promptVersion ?? PROMPT_VERSION;
  const restricted =
    version !== 1 && (input.mode === "nudge" || input.mode === "hint");
  const factJson = JSON.stringify(
    factToPromptJson(input.fact, input.kidColor, restricted ? version : 1),
    null,
    2,
  );

  return {
    model: options.model,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: restricted
          ? factJson
          : `${factJson}\nReference note: ${input.templateText}`,
      },
    ],
    temperature: 0.6,
    max_tokens: 120,
    stream: false,
  };
}

type PromptFactJson = {
  schemaVersion: CoachFact["schemaVersion"];
  pieces: { owner: "yours" | "theirs"; piece: string; square?: string }[];
  moves?: string[];
  squares?: string[];
  betterMove?: string;
  mateIn?: number;
  kind: CoachFact["kind"];
};

function factToPromptJson(
  fact: CoachFact,
  inputKidColor: "w" | "b",
  version: PromptVersion,
): PromptFactJson {
  return {
    schemaVersion: fact.schemaVersion,
    pieces: fact.pieces.map((piece) => ({
      owner: piece.color === inputKidColor ? "yours" : "theirs",
      piece: PIECE_WORDS[piece.type].singular,
      ...(version === 3 ? {} : { square: piece.square }),
    })),
    ...(version === 3 ? {} : { moves: fact.moves, squares: fact.squares }),
    ...(version !== 1 || fact.betterMoveSan === undefined
      ? {}
      : { betterMove: fact.betterMoveSan }),
    ...(fact.mateIn === undefined ? {} : { mateIn: fact.mateIn }),
    kind: fact.kind,
  };
}
