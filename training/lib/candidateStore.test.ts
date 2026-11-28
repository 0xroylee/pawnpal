import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openCandidateStore } from "./candidateStore.ts";

async function createRunDir(): Promise<string> {
  const root = join(process.cwd(), "training/runs");
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, "candidate-store-"));
}

function record(candidateIndex: number, text: string): string {
  return JSON.stringify({
    cacheKey: "cache-key",
    candidateIndex,
    promptId: "prompt-1",
    text,
  });
}

describe("openCandidateStore", () => {
  it("recovers a torn final record and appends a valid record", async () => {
    const directory = await createRunDir();
    const path = join(directory, "progress.jsonl");
    await writeFile(path, `${record(0, "Saved.")}\n{"promptId":`, "utf8");

    try {
      const store = await openCandidateStore(path);
      expect(store.recoveredTornTail).toBe(true);
      expect(store.get("cache-key")?.get(0)).toEqual({ text: "Saved." });
      await store.put(
        "cache-key",
        1,
        { text: "Also saved." },
        { promptId: "prompt-1" },
      );
      await store.close();

      const lines = (await readFile(path, "utf8")).trim().split("\n");
      expect(lines.map((line) => JSON.parse(line))).toEqual([
        JSON.parse(record(0, "Saved.")),
        JSON.parse(record(1, "Also saved.")),
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a corrupt middle record with its line number", async () => {
    const directory = await createRunDir();
    const path = join(directory, "progress.jsonl");
    await writeFile(
      path,
      `${record(0, "First.")}\n{not json}\n${record(1, "Last.")}\n`,
      "utf8",
    );

    try {
      await expect(openCandidateStore(path)).rejects.toThrow(
        "progress.jsonl:2: corrupt record",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
