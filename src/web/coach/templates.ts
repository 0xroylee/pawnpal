import type { Color } from "chess.js";
import messages from "../i18n/en.json";
import type {
  CoachFact,
  CoachMode,
  FactKind,
  PieceRef,
} from "../../shared/coach/types.ts";

export type MessageKey = keyof typeof messages & string;
export type TemplateKind = FactKind | "noFact";
export type HintTemplateMode = "hint1" | "hint2" | "hint3";
export type TemplateMode = CoachMode | HintTemplateMode | "late";
export type MessageParams = {
  piece?: string;
  attacker?: string;
  betterPiece?: string;
  target?: string;
  mateIn?: string;
};
export type MessageKeyOptions = { escape?: boolean };
export type VariantPicker = { pick(keys: MessageKey[]): MessageKey };
export type VariantHistory = Record<string, MessageKey>;

const PIECE_MESSAGE_KEYS: Record<PieceRef["type"], MessageKey> = {
  p: "piece.pawn",
  n: "piece.knight",
  b: "piece.bishop",
  r: "piece.rook",
  q: "piece.queen",
  k: "piece.king",
};

export function messageKeys(
  kind: TemplateKind,
  mode: TemplateMode,
  options: MessageKeyOptions = {},
): MessageKey[] {
  let prefix: string;
  if (mode === "hint1") prefix = "hint.tier1.";
  else if (mode === "hint2") {
    prefix = kind === "noFact" ? "hint.tier2.generic." : `hint.tier2.${kind}.`;
  } else if (mode === "hint3") prefix = "hint.tier3.";
  else if (mode === "late") {
    prefix = kind === "noFact" ? "coach.noFact.late." : `coach.${kind}.late.`;
  } else if (mode === "reveal" && options.escape) {
    prefix = "coach.reveal.escape.";
  } else if (kind === "noFact" && mode === "explain") {
    prefix = "coach.noFact.explain.";
  } else if (kind === "noFact" && mode === "reveal") {
    prefix = "coach.reveal.generic.";
  } else if (kind === "noFact" && mode === "praise") {
    prefix = "coach.noFact.praise.";
  } else if (kind !== "noFact") {
    prefix = `coach.${kind}.${mode}.`;
  } else {
    return [];
  }

  return (Object.keys(messages) as MessageKey[])
    .filter((key) => key.startsWith(prefix))
    .sort(compareVariantKeys);
}

export function factParams(
  fact: CoachFact | undefined,
  kidColor: Color,
  playedMoveUci?: string,
): MessageParams {
  if (!fact) return {};
  const kidPiece =
    (fact.subject?.color === kidColor ? fact.subject : undefined) ??
    fact.targets?.find((piece) => piece.color === kidColor);
  const betterPiece =
    (fact.betterMover?.color === kidColor ? fact.betterMover : undefined) ??
    (fact.subject?.color === kidColor ? fact.subject : undefined) ??
    (fact.attacker?.color === kidColor ? fact.attacker : undefined);
  const target = fact.targets?.[0];
  const betterWord = betterPiece ? pieceWord(betterPiece) : undefined;
  const distinctSameType =
    fact.betterMover?.color === kidColor &&
    hasSameTypeThreatenedRole(fact, fact.betterMover) &&
    !betterMoverIsThreatenedPiece(fact, playedMoveUci, kidColor);

  return {
    ...(kidPiece ? { piece: pieceWord(kidPiece) } : {}),
    ...(fact.attacker ? { attacker: pieceWord(fact.attacker) } : {}),
    ...(betterWord
      ? { betterPiece: distinctSameType ? `other ${betterWord}` : betterWord }
      : {}),
    ...(target ? { target: pieceWord(target) } : {}),
    ...(fact.mateIn ? { mateIn: numberWord(fact.mateIn) } : {}),
  };
}

export function createVariantPicker(
  rng: () => number = Math.random,
): VariantPicker {
  const previousByGroup = new Map<string, MessageKey>();
  return {
    pick(keys) {
      if (keys.length === 0)
        throw new Error("Cannot pick from an empty key list");
      const group = keys[0]!.replace(/\.\d+$/, "");
      const rawIndex = Math.floor(rng() * keys.length);
      const index = Math.min(keys.length - 1, Math.max(0, rawIndex));
      let picked = keys[index]!;
      if (keys.length > 1 && picked === previousByGroup.get(group)) {
        picked = keys[(index + 1) % keys.length]!;
      }
      previousByGroup.set(group, picked);
      return picked;
    },
  };
}

export function renderMessage(input: {
  kind: TemplateKind;
  mode: TemplateMode;
  fact?: CoachFact;
  params?: Partial<MessageParams>;
  playedMoveUci?: string;
  picker?: VariantPicker;
  history?: VariantHistory;
  variantSeed?: number;
  kidColor: Color;
}): { key: MessageKey; text: string; history?: VariantHistory } {
  const escape =
    input.mode === "reveal" &&
    betterMoverIsThreatenedPiece(
      input.fact,
      input.playedMoveUci,
      input.kidColor,
    );
  const keys = messageKeys(input.kind, input.mode, { escape });
  if (keys.length === 0) {
    throw new Error(
      `No coach message variants for ${input.kind}.${input.mode}`,
    );
  }
  const selection: { key: MessageKey; history?: VariantHistory } = input.history
    ? pickWithHistory(keys, input.history, input.variantSeed ?? 0)
    : input.picker
      ? { key: input.picker.pick(keys) }
      : pickWithHistory(keys, {}, input.variantSeed ?? 0);
  const { key } = selection;
  const params = {
    ...factParams(input.fact, input.kidColor, input.playedMoveUci),
    ...input.params,
  };
  const text = messages[key].replace(
    /\{(piece|attacker|betterPiece|target|mateIn)\}/g,
    (_placeholder, name: keyof MessageParams) => params[name] ?? "piece",
  );
  return {
    key,
    text,
    ...(selection.history ? { history: selection.history } : {}),
  };
}

export function betterMoverIsThreatenedPiece(
  fact: CoachFact | undefined,
  playedMoveUci: string | undefined,
  kidColor: Color,
): boolean {
  const mover = fact?.betterMover;
  if (!fact || !mover || mover.color !== kidColor) return false;
  const targets = [fact.subject, ...(fact.targets ?? [])].filter(
    (piece) => piece?.color === kidColor,
  );
  const from = playedMoveUci?.slice(0, 2);
  const to = playedMoveUci?.slice(2, 4);
  return targets.some(
    (target) =>
      target?.type === mover.type &&
      target.color === mover.color &&
      (target.square === mover.square ||
        (from === mover.square && to === target.square)),
  );
}

function hasSameTypeThreatenedRole(fact: CoachFact, mover: PieceRef): boolean {
  return [fact.subject, ...(fact.targets ?? [])].some(
    (target) => target?.type === mover.type && target.color === mover.color,
  );
}

function pickWithHistory(
  keys: MessageKey[],
  history: VariantHistory,
  variantSeed: number,
): { key: MessageKey; history: VariantHistory } {
  const group = keys[0]!.replace(/\.\d+$/, "");
  const rawIndex = Math.floor(variantSeed * keys.length);
  const baseIndex = Math.min(keys.length - 1, Math.max(0, rawIndex));
  let index = baseIndex;
  if (keys.length > 1 && keys[index] === history[group]) {
    index = (index + 1) % keys.length;
  }
  const key = keys[index]!;
  return { key, history: { ...history, [group]: key } };
}

function numberWord(value: number): string {
  const words: Record<number, string> = {
    1: "one move",
    2: "two moves",
    3: "three moves",
  };
  return words[value] ?? "a few moves";
}

export function pieceWord(piece: PieceRef): string {
  return messages[PIECE_MESSAGE_KEYS[piece.type]];
}

function compareVariantKeys(left: MessageKey, right: MessageKey): number {
  return (
    Number(left.match(/\.(\d+)$/)?.[1]) - Number(right.match(/\.(\d+)$/)?.[1])
  );
}
