import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { writeStreamAtomic } from "./atomicWrite.ts";

export async function* readJsonl<T = unknown>(path: string): AsyncGenerator<T> {
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (line.trim() === "") continue;

      try {
        yield JSON.parse(line) as T;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${path}:${lineNumber}: invalid JSONL record: ${detail}`,
          { cause: error },
        );
      }
    }
  } finally {
    lines.close();
    input.destroy();
  }
}

export async function writeJsonl(
  path: string,
  records: Iterable<unknown> | AsyncIterable<unknown>,
): Promise<void> {
  // The destination contains either its complete previous content or the complete new content.
  await writeStreamAtomic(path, async (write) => {
    for await (const record of records) {
      const serialized = JSON.stringify(record);
      if (serialized === undefined) {
        throw new TypeError("JSONL record must serialize to a JSON value");
      }
      await write(`${serialized}\n`);
    }
  });
}
