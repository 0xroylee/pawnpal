import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { readJsonl, writeJsonl } from "./jsonl.ts";

async function createRunDir(): Promise<string> {
  const root = join(process.cwd(), "training/runs");
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, "jsonl-"));
}

async function collect<T>(records: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];
  for await (const record of records) result.push(record);
  return result;
}

describe("JSONL helpers", () => {
  it("streams records to and from JSONL", async () => {
    const directory = await createRunDir();
    const path = join(directory, "records.jsonl");

    try {
      const records = [
        { id: 1, text: "first" },
        { id: 2, text: "second" },
      ];
      await writeJsonl(path, records);

      expect(await readFile(path, "utf8")).toBe(
        '{"id":1,"text":"first"}\n{"id":2,"text":"second"}\n',
      );
      await expect(
        collect(readJsonl<(typeof records)[number]>(path)),
      ).resolves.toEqual(records);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("skips blank lines and reports malformed line numbers", async () => {
    const directory = await createRunDir();
    const path = join(directory, "records.jsonl");

    try {
      await writeFile(path, '{"id":1}\n\nnot json\n', "utf8");
      await expect(collect(readJsonl(path))).rejects.toThrow("records.jsonl:3");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves the previous file when a record iterator fails", async () => {
    const directory = await createRunDir();
    const path = join(directory, "records.jsonl");
    const previous = '{"id":0}\n';
    await writeFile(path, previous, "utf8");

    async function* failingRecords() {
      yield { id: 1 };
      yield { id: 2 };
      throw new Error("injected JSONL failure");
    }

    try {
      await expect(writeJsonl(path, failingRecords())).rejects.toThrow(
        "injected JSONL failure",
      );

      expect(await readFile(path, "utf8")).toBe(previous);
      expect(await readdir(directory)).toEqual(["records.jsonl"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
