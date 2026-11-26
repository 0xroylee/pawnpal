import { appendFile, mkdir, readFile, truncate } from "node:fs/promises";
import { dirname } from "node:path";
import type { CandidateCache, CandidateSuccess } from "./teacher.ts";

type ProgressRecord = {
  cacheKey: string;
  candidateIndex: number;
  promptId: string;
  text: string;
};

export async function openCandidateStore(
  path: string,
): Promise<
  CandidateCache & { close(): Promise<void>; recoveredTornTail: boolean }
> {
  await mkdir(dirname(path), { recursive: true });
  let content = "";
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const cache = new Map<string, Map<number, CandidateSuccess>>();
  const lines = content.split("\n");
  let byteOffset = 0;
  let lastGoodOffset = 0;
  let pendingMalformedLine: number | undefined;

  for (const [index, line] of lines.entries()) {
    const hasNewline = index < lines.length - 1;
    byteOffset += Buffer.byteLength(line, "utf8") + Number(hasNewline);
    if (line.trim() === "") continue;

    if (pendingMalformedLine !== undefined) {
      throw corruptRecord(path, pendingMalformedLine);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      pendingMalformedLine = index + 1;
      continue;
    }
    if (!isProgressRecord(parsed)) throw corruptRecord(path, index + 1);

    const successes = cache.get(parsed.cacheKey) ?? new Map();
    successes.set(parsed.candidateIndex, { text: parsed.text });
    cache.set(parsed.cacheKey, successes);
    lastGoodOffset = byteOffset;
  }

  const recoveredTornTail = pendingMalformedLine !== undefined;
  if (recoveredTornTail) await truncate(path, lastGoodOffset);

  let needsSeparator =
    !recoveredTornTail && content.length > 0 && !content.endsWith("\n");

  return {
    recoveredTornTail,
    get(cacheKey) {
      return cache.get(cacheKey);
    },
    async put(cacheKey, candidateIndex, success, meta) {
      const record: ProgressRecord = {
        cacheKey,
        candidateIndex,
        promptId: meta.promptId,
        text: success.text,
      };
      const prefix = needsSeparator ? "\n" : "";
      await appendFile(path, `${prefix}${JSON.stringify(record)}\n`, "utf8");
      needsSeparator = false;
      const successes = cache.get(cacheKey) ?? new Map();
      successes.set(candidateIndex, { ...success });
      cache.set(cacheKey, successes);
    },
    async close() {},
  };
}

function isProgressRecord(value: unknown): value is ProgressRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.cacheKey === "string" &&
    Number.isInteger(record.candidateIndex) &&
    typeof record.candidateIndex === "number" &&
    record.candidateIndex >= 0 &&
    typeof record.promptId === "string" &&
    typeof record.text === "string"
  );
}

function corruptRecord(path: string, lineNumber: number): Error {
  return new Error(`${path}:${lineNumber}: corrupt record`);
}
