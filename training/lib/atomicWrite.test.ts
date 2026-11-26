import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import {
  isTempPath,
  writeFileAtomic,
  writeStreamAtomic,
} from "./atomicWrite.ts";

async function createRunDir(): Promise<string> {
  const root = join(process.cwd(), "training/runs");
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, "atomic-write-"));
}

describe("atomic file writes", () => {
  it("replaces the destination only after a complete write", async () => {
    const directory = await createRunDir();
    const path = join(directory, "nested", "result.txt");

    try {
      await writeFileAtomic(path, "complete\n");

      expect(await readFile(path, "utf8")).toBe("complete\n");
      expect(await readdir(join(directory, "nested"))).toEqual(["result.txt"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves the previous destination and removes its temp after a producer throws", async () => {
    const directory = await createRunDir();
    const path = join(directory, "result.txt");
    await writeFile(path, "previous bytes\n");

    try {
      await expect(
        writeStreamAtomic(path, async (write) => {
          await write("first\n");
          await write("second\n");
          throw new Error("injected write failure");
        }),
      ).rejects.toThrow("injected write failure");

      expect(await readFile(path, "utf8")).toBe("previous bytes\n");
      expect(await readdir(directory)).toEqual(["result.txt"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recognizes only the generated temp suffix", () => {
    expect(isTempPath("result.txt.tmp-0123456789abcdef")).toBe(true);
    expect(isTempPath("result.txt.tmp-0123456789abcde")).toBe(false);
    expect(isTempPath("result.txt.tmp-0123456789abcdeF")).toBe(false);
    expect(isTempPath("result.txt.tmp-0123456789abcdef-extra")).toBe(false);
    expect(isTempPath("result.txt")).toBe(false);
  });
});
