import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable, type Transform } from "node:stream";
import * as zlib from "node:zlib";
import { createHash } from "node:crypto";

export type PgnGame = {
  id: string;
  pgn: string;
  headers: Record<string, string>;
  whiteElo?: number;
  blackElo?: number;
  site?: string;
  event?: string;
};

export type PgnStreamOptions = {
  minRating?: number;
  maxRating?: number;
  limit?: number;
};

const HEADER_LINE = /^\s*\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"])*)"\]\s*$/;

function isHeaderLine(line: string): boolean {
  return HEADER_LINE.test(line);
}

export type PgnLineKind = "header" | "movetext" | "blank";

export function createPgnScanner(): {
  classify(line: string): PgnLineKind;
  startsNewGame(line: string): boolean;
  reset(): void;
} {
  let hasMovetext = false;
  let inBraceComment = false;

  return {
    classify(line) {
      if (!inBraceComment && isHeaderLine(line)) return "header";
      if (line.trim() === "") return "blank";

      hasMovetext = true;
      inBraceComment = updateBraceCommentState(line, inBraceComment);
      return "movetext";
    },
    startsNewGame(line) {
      return hasMovetext && !inBraceComment && isHeaderLine(line);
    },
    reset() {
      hasMovetext = false;
      inBraceComment = false;
    },
  };
}

export function splitPgnText(pgn: string): {
  headers: Record<string, string>;
  movetext: string;
} {
  const headers: Record<string, string> = {};
  const movetextLines: string[] = [];
  const scanner = createPgnScanner();

  for (const [index, originalLine] of pgn.split(/\r?\n/).entries()) {
    const line =
      index === 0 ? originalLine.replace(/^\uFEFF/, "") : originalLine;
    if (scanner.classify(line) === "header") {
      const match = HEADER_LINE.exec(line);
      if (match) headers[match[1] ?? ""] = unescapeHeader(match[2] ?? "");
    } else {
      movetextLines.push(line);
    }
  }

  return { headers, movetext: movetextLines.join("\n").trim() };
}

export async function* splitPgnStream(
  source: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<string> {
  const input = Readable.from(source);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let currentLines: string[] = [];
  const scanner = createPgnScanner();

  try {
    for await (const line of lines) {
      const normalized = line.replace(/^\uFEFF/, "");
      if (scanner.startsNewGame(normalized)) {
        const previous = currentLines.join("\n").trim();
        if (previous !== "") yield previous;
        currentLines = [];
        scanner.reset();
      }

      currentLines.push(normalized);
      scanner.classify(normalized);
    }
  } finally {
    lines.close();
    input.destroy();
  }

  const last = currentLines.join("\n").trim();
  if (last !== "") yield last;
}

function updateBraceCommentState(line: string, inComment: boolean): boolean {
  let next = inComment;
  for (const character of line) {
    if (next) {
      if (character === "}") next = false;
    } else if (character === "{") {
      next = true;
    } else if (character === ";") {
      break;
    }
  }
  return next;
}

function unescapeHeader(value: string): string {
  return value.replace(/\\(["\\])/g, "$1");
}

function parseRating(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

export function parsePgnGame(pgn: string): PgnGame {
  const { headers } = splitPgnText(pgn);

  const normalized = pgn.trim();
  return {
    id: createHash("sha256").update(normalized).digest("hex"),
    pgn: normalized,
    headers,
    whiteElo: parseRating(headers.WhiteElo),
    blackElo: parseRating(headers.BlackElo),
    site: headers.Site,
    event: headers.Event,
  };
}

function openPgnInput(path: string): { stream: Readable; close: () => void } {
  if (path === "-") return { stream: process.stdin, close: () => {} };

  if (path.endsWith(".pgn.zst")) {
    const createDecompress = Reflect.get(zlib, "createZstdDecompress") as
      (() => Transform) | undefined;
    if (!createDecompress) {
      throw new Error(
        "This Node version cannot decompress .pgn.zst; pipe zstdcat to stdin instead",
      );
    }

    const file = createReadStream(path);
    const decompressor = createDecompress();
    file.pipe(decompressor);
    return {
      stream: decompressor,
      close: () => {
        file.destroy();
        decompressor.destroy();
      },
    };
  }

  if (path.endsWith(".pgn")) {
    const stream = createReadStream(path);
    return { stream, close: () => stream.destroy() };
  }

  throw new Error(`Unsupported PGN input: ${path}`);
}

function validateOptions({
  minRating,
  maxRating,
  limit,
}: PgnStreamOptions): void {
  if (minRating !== undefined && !Number.isFinite(minRating)) {
    throw new Error("minRating must be a finite number");
  }
  if (maxRating !== undefined && !Number.isFinite(maxRating)) {
    throw new Error("maxRating must be a finite number");
  }
  if (
    minRating !== undefined &&
    maxRating !== undefined &&
    minRating > maxRating
  ) {
    throw new Error("minRating must not exceed maxRating");
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error("limit must be a non-negative integer");
  }
}

function hasInRangeRating(
  game: PgnGame,
  minRating: number,
  maxRating: number,
): boolean {
  return [game.whiteElo, game.blackElo].some(
    (rating) =>
      rating !== undefined && rating >= minRating && rating <= maxRating,
  );
}

export async function* readPgnGames(
  path: string,
  options: PgnStreamOptions = {},
): AsyncGenerator<PgnGame> {
  validateOptions(options);
  const minRating = options.minRating ?? 600;
  const maxRating = options.maxRating ?? 1400;
  const limit = options.limit;
  if (limit === 0) return;

  const { stream, close } = openPgnInput(path);
  let kept = 0;
  try {
    for await (const pgn of splitPgnStream(stream)) {
      const game = parsePgnGame(pgn);
      if (!hasInRangeRating(game, minRating, maxRating)) continue;
      yield game;
      kept += 1;
      if (limit !== undefined && kept >= limit) return;
    }
  } finally {
    close();
  }
}
