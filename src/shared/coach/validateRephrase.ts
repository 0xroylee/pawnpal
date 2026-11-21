import { PIECE_WORDS } from "./pieceWords.ts";
import type { CoachFact, RephraseMode, RephraseReason } from "./types.ts";

export type RephraseValidation =
  { ok: true; text: string } | { ok: false; reason: RephraseReason };

const META_OPENING =
  /^\s*(?:sure|here is|here's|as an ai|certainly|of course)\b/i;
const URL =
  /\b[a-z][a-z0-9+.-]*:\S|\bwww\.\S+|\b[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/i;
const UNSAFE_WORD = /\b(?:idiot|stupid|dumb|hate|kill|loser|destroy)\b/i;
const EMOJI_CHAR =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\uFE0F|\u20E3|\u200D|[\u{E0020}-\u{E007F}])/u;
const NUMBER_CHAR = /\p{N}/u;
const TOKEN_PATTERN =
  /(\s+)|([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?(?![A-Za-z0-9]))|([A-Za-z]+(?:['’-][A-Za-z]+)*)|([-.,!?;'"‘’“”])/iy;
const CASTLING_TOKEN_PATTERN = /O-O(?:-O)?[+#]?/y;
const CONNECTED_WORD_RUN_PATTERN = /[A-Za-z]+(?:[-'’][A-Za-z]+)*/g;
const CASTLING_BOUNDARY_PUNCTUATION = /^[.,!?;"‘“”]$/;

type TokenKind = "space" | "notation" | "word" | "punct" | "stray";
type LexedToken = { kind: TokenKind; text: string };
type StrayClass = "emoji" | "number" | "other";
type LexedText = {
  tokens: LexedToken[];
  strays: { char: string; class: StrayClass }[];
  hasInvalidCastlingRun: boolean;
};
type TextRange = { start: number; end: number };

export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function validateRephrase(
  raw: string,
  ctx: { fact: CoachFact; mode: RephraseMode; kidColor: "w" | "b" },
): RephraseValidation {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, reason: "empty" };
  if (META_OPENING.test(text)) return { ok: false, reason: "meta-opening" };
  if (URL.test(text)) return { ok: false, reason: "url" };

  const lexed = lex(text);
  if (lexed.strays.some((stray) => stray.class === "emoji")) {
    return { ok: false, reason: "emoji" };
  }
  if (lexed.strays.some((stray) => stray.class === "other")) {
    return { ok: false, reason: "disallowed-character" };
  }
  if (UNSAFE_WORD.test(text)) return { ok: false, reason: "unsafe-word" };
  if (text.length > 220) return { ok: false, reason: "too-long" };
  const sentenceCount = text
    .split(/[.!?]+/)
    .filter((part) => part.trim()).length;
  if (sentenceCount > 2) {
    return { ok: false, reason: "too-many-sentences" };
  }

  if (lexed.hasInvalidCastlingRun) {
    return { ok: false, reason: "unknown-move" };
  }

  if (
    (ctx.mode === "nudge" || ctx.mode === "hint") &&
    revealsBetterMove(lexed.tokens, ctx.fact, ctx.kidColor)
  ) {
    return { ok: false, reason: "reveals-better-move" };
  }

  const allowedSquares = new Set(
    ctx.fact.squares.map((square) => square.toLowerCase()),
  );
  const allowedMoves = new Set(
    ctx.fact.moves.map((move) => move.toLowerCase()),
  );
  for (const token of lexed.tokens) {
    const normalized = token.text.toLowerCase();
    if (
      token.kind === "notation" &&
      /^[a-h][1-8]$/.test(normalized) &&
      !allowedSquares.has(normalized) &&
      !allowedMoves.has(normalized)
    ) {
      return { ok: false, reason: "unknown-square" };
    }
  }

  for (const token of lexed.tokens) {
    if (token.kind !== "notation") continue;
    const normalized = token.text.toLowerCase();
    if (allowedMoves.has(normalized)) continue;
    if (/^[a-h][1-8]$/.test(normalized) && allowedSquares.has(normalized)) {
      continue;
    }
    return { ok: false, reason: "unknown-move" };
  }

  if (lexed.strays.some((stray) => stray.class === "number")) {
    return { ok: false, reason: "digits" };
  }

  if (mentionsUnknownPiece(lexed.tokens, ctx.fact)) {
    return { ok: false, reason: "unknown-piece" };
  }

  return { ok: true, text };
}

function lex(text: string): LexedText {
  const tokens: LexedToken[] = [];
  const strays: LexedText["strays"] = [];
  const invalidCastlingMarkerRanges = findInvalidCastlingMarkerRanges(text);
  let offset = 0;

  while (offset < text.length) {
    const castling = matchStandaloneCastling(text, offset);
    if (castling !== undefined) {
      tokens.push({ kind: "notation", text: castling });
      offset += castling.length;
      continue;
    }

    const invalidMarkerRange = invalidCastlingMarkerRanges.find(
      (range) => range.start === offset,
    );
    if (invalidMarkerRange) {
      offset = invalidMarkerRange.end;
      continue;
    }

    TOKEN_PATTERN.lastIndex = offset;
    const match = TOKEN_PATTERN.exec(text);
    if (match) {
      const kind: TokenKind =
        match[1] !== undefined
          ? "space"
          : match[2] !== undefined
            ? "notation"
            : match[3] !== undefined
              ? "word"
              : "punct";
      tokens.push({ kind, text: match[0] });
      offset += match[0].length;
      continue;
    }

    const codePoint = text.codePointAt(offset)!;
    const char = String.fromCodePoint(codePoint);
    const strayClass: StrayClass = EMOJI_CHAR.test(char)
      ? "emoji"
      : NUMBER_CHAR.test(char)
        ? "number"
        : "other";
    strays.push({ char, class: strayClass });
    tokens.push({ kind: "stray", text: char });
    offset += char.length;
  }

  return {
    tokens,
    strays,
    hasInvalidCastlingRun:
      containsInvalidCastlingRun(text) || containsRepeatedOItems(tokens),
  };
}

function containsInvalidCastlingRun(text: string): boolean {
  const standaloneRanges = findStandaloneCastlingRanges(text);
  const joinedO = /[Oo][-'’][Oo]/g;
  let joinedMatch = joinedO.exec(text);
  while (joinedMatch !== null) {
    const start = joinedMatch.index;
    const end = start + joinedMatch[0].length;
    const isExactToken = standaloneRanges.some(
      (range) => range.start <= start && range.end >= end,
    );
    if (!isExactToken) return true;
    joinedMatch = joinedO.exec(text);
  }

  CONNECTED_WORD_RUN_PATTERN.lastIndex = 0;
  let match = CONNECTED_WORD_RUN_PATTERN.exec(text);
  while (match !== null) {
    const run = match[0];
    if (/^[Oo]{2,}$/.test(run) || run.includes("OO")) return true;

    match = CONNECTED_WORD_RUN_PATTERN.exec(text);
  }
  return false;
}

function findStandaloneCastlingRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  for (let offset = 0; offset < text.length; offset += 1) {
    const token = matchStandaloneCastling(text, offset);
    if (token === undefined) continue;
    ranges.push({ start: offset, end: offset + token.length });
    offset += token.length - 1;
  }
  return ranges;
}

function findInvalidCastlingMarkerRanges(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  const joinedRunWithMarkers = /[Oo](?:[-'’][Oo])+[+#]+/g;
  let match = joinedRunWithMarkers.exec(text);
  while (match !== null) {
    const markersOffset = match[0].search(/[+#]+$/);
    const markerStart = match.index + markersOffset;
    const markerCount = match[0].length - markersOffset;
    const exactToken = matchStandaloneCastling(text, match.index);
    if (markerCount > 1 || exactToken !== match[0]) {
      ranges.push({ start: markerStart, end: match.index + match[0].length });
    }
    match = joinedRunWithMarkers.exec(text);
  }
  return ranges;
}

function containsRepeatedOItems(tokens: LexedToken[]): boolean {
  let itemCount = 0;
  for (const token of tokens) {
    const isOItem =
      (token.kind === "word" && /^[Oo]$/.test(token.text)) ||
      (token.kind === "notation" && /^O-O(?:-O)?[+#]?$/.test(token.text));
    if (isOItem) {
      itemCount += 1;
      if (itemCount > 1) return true;
    } else if (token.kind !== "space" && token.kind !== "punct") {
      itemCount = 0;
    }
  }
  return false;
}

function matchStandaloneCastling(
  text: string,
  offset: number,
): string | undefined {
  if (!isCastlingBoundary(text[offset - 1])) return undefined;

  CASTLING_TOKEN_PATTERN.lastIndex = offset;
  const match = CASTLING_TOKEN_PATTERN.exec(text);
  if (!match || !isCastlingBoundary(text[offset + match[0].length])) {
    return undefined;
  }
  return match[0];
}

function isCastlingBoundary(char: string | undefined): boolean {
  return (
    char === undefined ||
    /^\s$/u.test(char) ||
    CASTLING_BOUNDARY_PUNCTUATION.test(char)
  );
}

function revealsBetterMove(
  tokens: LexedToken[],
  fact: CoachFact,
  kidColor: "w" | "b",
): boolean {
  const targetSquare =
    fact.betterMoveUci?.slice(2, 4).toLowerCase() ??
    (fact.betterMoveSan
      ? sanDestination(fact.betterMoveSan, kidColor)
      : undefined);
  return tokens.some((token) => {
    if (token.kind !== "notation") return false;
    if (fact.betterMoveSan?.toLowerCase() === token.text.toLowerCase()) {
      return true;
    }
    return (
      targetSquare !== undefined &&
      sanDestination(token.text, kidColor) === targetSquare
    );
  });
}

function sanDestination(san: string, kidColor: "w" | "b"): string | undefined {
  const normalized = san
    .trim()
    .replace(/\s*e\.p\.$/i, "")
    .replace(/[+#]+$/, "");

  if (/^(?:O-O|0-0)$/i.test(normalized)) {
    return kidColor === "w" ? "g1" : "g8";
  }
  if (/^(?:O-O-O|0-0-0)$/i.test(normalized)) {
    return kidColor === "w" ? "c1" : "c8";
  }

  const move = normalized.replace(/=[QRBN]$/i, "");
  const destinations = move.match(/[a-h][1-8]/gi);
  return destinations?.[destinations.length - 1]?.toLowerCase();
}

function mentionsUnknownPiece(tokens: LexedToken[], fact: CoachFact): boolean {
  const allowedTypes = new Set(fact.pieces.map((piece) => piece.type));
  const typeByWord = new Map<string, keyof typeof PIECE_WORDS>();
  for (const [type, words] of Object.entries(PIECE_WORDS)) {
    typeByWord.set(words.singular, type as keyof typeof PIECE_WORDS);
    typeByWord.set(words.plural, type as keyof typeof PIECE_WORDS);
  }

  for (const token of tokens) {
    if (token.kind !== "word") continue;
    for (const word of token.text.split(/[-'’]/)) {
      const type = typeByWord.get(word.toLowerCase());
      if (type && !allowedTypes.has(type)) return true;
    }
  }
  return false;
}
