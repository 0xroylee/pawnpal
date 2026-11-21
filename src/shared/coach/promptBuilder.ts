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
};

const MODE_RULES = {
  nudge: "Do not reveal the better move.",
  explain: "Say what happens next in plain words.",
  reveal: "You may name the better move exactly as it appears in the facts.",
  praise: "Keep it to one cheerful sentence.",
  hint: "Do not reveal the move; point the child at the piece.",
} as const;

export function buildRephraseRequest(
  input: RephraseRequestInput,
  options: { model: string },
): ChatCompletionRequest {
  const age = input.kidAge ?? "about 8";
  const systemContent =
    `You are Pip, a friendly chess coach talking to a child aged ${age}. ` +
    "Rewrite the coach note for the child in at most two short sentences. " +
    "Use only the facts given. Never mention a move, square or piece that isn't in the facts. " +
    "No numbers, no evaluations, no notation unless it's listed in the facts. " +
    MODE_RULES[input.mode];
  const factJson = JSON.stringify(
    factToPromptJson(input.fact, input.kidColor),
    null,
    2,
  );

  return {
    model: options.model,
    messages: [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `${factJson}\nReference note: ${input.templateText}`,
      },
    ],
    temperature: 0.6,
    max_tokens: 120,
    stream: false,
  };
}

type PromptFactJson = {
  schemaVersion: CoachFact["schemaVersion"];
  pieces: { owner: "yours" | "theirs"; piece: string; square: string }[];
  moves: string[];
  squares: string[];
  betterMove?: string;
  mateIn?: number;
  kind: CoachFact["kind"];
};

function factToPromptJson(
  fact: CoachFact,
  inputKidColor: "w" | "b",
): PromptFactJson {
  return {
    schemaVersion: fact.schemaVersion,
    pieces: fact.pieces.map((piece) => ({
      owner: piece.color === inputKidColor ? "yours" : "theirs",
      piece: PIECE_WORDS[piece.type].singular,
      square: piece.square,
    })),
    moves: fact.moves,
    squares: fact.squares,
    ...(fact.betterMoveSan === undefined
      ? {}
      : { betterMove: fact.betterMoveSan }),
    ...(fact.mateIn === undefined ? {} : { mateIn: fact.mateIn }),
    kind: fact.kind,
  };
}
