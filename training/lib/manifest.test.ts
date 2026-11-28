import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { vi } from "vitest";
import * as atomicWrite from "./atomicWrite.ts";
import { canonicalJson, runStage } from "./manifest.ts";

describe("canonicalJson", () => {
  it("sorts arbitrary object keys while preserving __proto__ as an own key", () => {
    const value = JSON.parse(
      '{"toString":"string","__proto__":"proto","constructor":"constructor"}',
    ) as Record<string, string>;

    expect(Object.keys(value)).toContain("__proto__");
    expect(canonicalJson(value)).toBe(
      '{"__proto__":"proto","constructor":"constructor","toString":"string"}',
    );
  });
});

async function createRunDir(): Promise<string> {
  const root = join(process.cwd(), "training/runs");
  await mkdir(root, { recursive: true });
  return mkdtemp(join(root, "manifest-"));
}

describe("runStage", () => {
  it("prefers Bun lockfile and invalidates cached outputs when it changes", async () => {
    const root = await createRunDir();
    const bundle = join(root, "training", "dist");
    await mkdir(bundle, { recursive: true });
    await writeFile(join(root, "package-lock.json"), "npm lock");
    await writeFile(join(root, "bun.lock"), "bun one");
    const options = {
      runDir: root,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundle,
      produce: async ({ directory }: { directory: string }) => {
        await writeFile(join(directory, "out"), "fixture");
        return { counts: {} };
      },
    };
    try {
      const first = await runStage(options);
      expect(first.manifest.lockfilePath).toBe(join(root, "bun.lock"));
      expect((await runStage(options)).skipped).toBe(true);
      await writeFile(join(root, "bun.lock"), "bun two");
      expect((await runStage(options)).skipped).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("writes a completed manifest and skips matching inputs", async () => {
    const runDir = await createRunDir();
    let produced = 0;
    const produce = async ({ directory }: { directory: string }) => {
      produced += 1;
      await writeFile(join(directory, "prompts.jsonl"), "fixture\n", "utf8");
      return { counts: { rows: 3 } };
    };

    try {
      const first = await runStage({
        runDir,
        stage: "02-prompts",
        inputs: { values: { seed: 3 } },
        params: { model: "fixture-model" },
        tools: { node: "fixture" },
        lockfile: null,
        produce,
      });
      const second = await runStage({
        runDir,
        stage: "02-prompts",
        inputs: { values: { seed: 3 } },
        params: { model: "fixture-model" },
        tools: { node: "fixture" },
        lockfile: null,
        produce,
      });
      const manifest = JSON.parse(
        await readFile(join(runDir, "02-prompts", "manifest.json"), "utf8"),
      );

      expect(first.skipped).toBe(false);
      expect(second.skipped).toBe(true);
      expect(produced).toBe(1);
      expect(manifest).toMatchObject({
        stage: "02-prompts",
        params: { model: "fixture-model" },
        counts: { rows: 3 },
        tools: { node: "fixture" },
        status: "complete",
      });
      expect(manifest.inputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(manifest.startedAt).toEqual(expect.any(String));
      expect(manifest.finishedAt).toEqual(expect.any(String));
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("reruns when tool versions or the running bundle code changes", async () => {
    const runDir = await createRunDir();
    const bundleDir = join(runDir, "bundle");
    await mkdir(bundleDir);
    const sourceA = join(bundleDir, "a.mjs");
    const sourceB = join(bundleDir, "b.mjs");
    await writeFile(sourceA, "export const version = 1;\n", "utf8");
    await writeFile(sourceB, "export const other = true;\n", "utf8");
    let produced = 0;
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: { values: { model: "fixture-model" } },
      params: {},
      tools: { node: "v1" },
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "output.jsonl"), "stable output\n");
        return { counts: {} };
      },
    };

    try {
      await runStage(options);
      const changedTool = await runStage({ ...options, tools: { node: "v2" } });
      await writeFile(sourceA, "export const version = 2;\n", "utf8");
      const changedCode = await runStage({
        ...options,
        tools: { node: "v2" },
      });

      expect(changedTool.skipped).toBe(false);
      expect(changedCode.skipped).toBe(false);
      expect(produced).toBe(3);
      expect(changedCode.manifest.codeFingerprint).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it.each([
    ["top-level module", "linked.mjs"],
    ["nested __proto__ module", "nested/__proto__.mjs"],
  ])(
    "rejects a symbolic link in the code bundle: %s",
    async (_, relativePath) => {
      const runDir = await createRunDir();
      const bundleDir = join(runDir, "bundle");
      const linkPath = join(bundleDir, relativePath);
      const targetPath = join(runDir, "linked-code.mjs");
      await mkdir(bundleDir);
      await writeFile(join(bundleDir, "entry.mjs"), "export {}\n");
      await writeFile(targetPath, "export const version = 1\n");
      let produced = 0;
      const options = {
        runDir,
        stage: "02-prompts" as const,
        inputs: {},
        params: {},
        tools: {},
        codeDirectory: bundleDir,
        lockfile: null,
        produce: async ({ directory }: { directory: string }) => {
          produced += 1;
          await writeFile(join(directory, "output.jsonl"), "fixture\n");
          return { counts: {} };
        },
      };

      try {
        await runStage(options);
        await mkdir(dirname(linkPath), { recursive: true });
        await symlink(targetPath, linkPath);

        await expect(runStage(options)).rejects.toThrow(linkPath);
        expect(produced).toBe(1);
      } finally {
        await rm(runDir, { recursive: true, force: true });
      }
    },
  );

  it("records output hashes and skips only while every output still matches", async () => {
    const runDir = await createRunDir();
    let produced = 0;
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: join(runDir, "bundle"),
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(
          join(directory, "prompts.jsonl"),
          `prompts-${produced}\n`,
        );
        await writeFile(
          join(directory, "counts.jsonl"),
          `counts-${produced}\n`,
        );
        return { counts: { rows: 1 } };
      },
    };
    await mkdir(options.codeDirectory);

    try {
      const first = await runStage(options);
      const skipped = await runStage(options);
      await writeFile(
        join(runDir, "02-prompts", "prompts.jsonl"),
        "tampered\n",
      );
      const changed = await runStage(options);
      await rm(join(runDir, "02-prompts", "counts.jsonl"));
      const deleted = await runStage(options);
      const manifest = JSON.parse(
        await readFile(join(runDir, "02-prompts", "manifest.json"), "utf8"),
      );

      expect(first.manifest.outputs).toMatchObject({
        "counts.jsonl": expect.stringMatching(/^[a-f0-9]{64}$/),
        "prompts.jsonl": expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(skipped.skipped).toBe(true);
      expect(changed.skipped).toBe(false);
      expect(deleted.skipped).toBe(false);
      expect(produced).toBe(3);
      expect(manifest.outputs["counts.jsonl"]).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("rejects an existing symbolic link before skipping a completed stage", async () => {
    const runDir = await createRunDir();
    const bundleDir = join(runDir, "bundle");
    const targetPath = join(runDir, "linked-output.jsonl");
    const linkPath = join(runDir, "02-prompts", "nested", "__proto__");
    await mkdir(bundleDir);
    await writeFile(targetPath, "linked output\n");
    let produced = 0;
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        const nested = join(directory, "nested");
        await mkdir(nested, { recursive: true });
        await writeFile(join(nested, "output.jsonl"), "fixture\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      const unchanged = await runStage(options);
      await symlink(targetPath, linkPath);

      await expect(runStage(options)).rejects.toThrow(linkPath);
      expect(first.skipped).toBe(false);
      expect(unchanged.skipped).toBe(true);
      expect(produced).toBe(1);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("persists failure and reruns when produce creates a symbolic link", async () => {
    const runDir = await createRunDir();
    const bundleDir = join(runDir, "bundle");
    const targetPath = join(runDir, "linked-output.jsonl");
    const linkPath = join(runDir, "02-prompts", "nested", "__proto__");
    await mkdir(bundleDir);
    await writeFile(targetPath, "linked output\n");
    let produced = 0;
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        const nested = join(directory, "nested");
        await mkdir(nested, { recursive: true });
        await writeFile(join(directory, "stable.jsonl"), "stable\n");
        await symlink(targetPath, linkPath);
        return { counts: { rows: 1 } };
      },
    };

    try {
      await expect(runStage(options)).rejects.toThrow(linkPath);
      const failed = JSON.parse(
        await readFile(join(runDir, "02-prompts", "manifest.json"), "utf8"),
      );
      await expect(runStage(options)).rejects.toThrow(linkPath);

      expect(failed.status).toBe("failed");
      expect(produced).toBe(1);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("hashes file contents and reruns after a change", async () => {
    const runDir = await createRunDir();
    const inputPath = join(runDir, "input.jsonl");
    await writeFile(inputPath, "first\n", "utf8");
    let produced = 0;
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { files: [inputPath] },
      params: {},
      tools: {},
      lockfile: null,
      produce: async () => {
        produced += 1;
        return { counts: {} };
      },
    };

    try {
      await runStage(options);
      await writeFile(inputPath, "second\n", "utf8");
      const changed = await runStage(options);
      expect(changed.skipped).toBe(false);
      expect(produced).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("marks failures and reruns them", async () => {
    const runDir = await createRunDir();
    let attempts = 0;
    const options = {
      runDir,
      stage: "05-split" as const,
      inputs: {},
      params: {},
      tools: {},
      lockfile: null,
      produce: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("fixture failure");
        return { counts: { train: 1 } };
      },
    };

    try {
      await expect(runStage(options)).rejects.toThrow("fixture failure");
      const failed = JSON.parse(
        await readFile(join(runDir, "05-split", "manifest.json"), "utf8"),
      );
      const recovered = await runStage(options);
      expect(failed.status).toBe("failed");
      expect(recovered.skipped).toBe(false);
      expect(attempts).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("persists failure and retries when the completion manifest write fails", async () => {
    const runDir = await createRunDir();
    const bundleDir = join(runDir, "bundle");
    await mkdir(bundleDir);
    const manifestPath = join(runDir, "02-prompts", "manifest.json");
    const completionError = new Error("completion manifest write failed");
    let manifestWrites = 0;
    let produced = 0;
    const originalWrite = atomicWrite.writeFileAtomic;
    const writeSpy = vi
      .spyOn(atomicWrite, "writeFileAtomic")
      .mockImplementation(async (path, contents) => {
        if (path === manifestPath && ++manifestWrites === 2) {
          throw completionError;
        }
        await originalWrite(path, contents);
      });
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "prompts.jsonl"), "fixture\n");
        return { counts: { rows: 1 } };
      },
    };

    try {
      await expect(runStage(options)).rejects.toBe(completionError);
      writeSpy.mockRestore();
      const failed = JSON.parse(await readFile(manifestPath, "utf8"));
      const retried = await runStage(options);

      expect(failed.status).toBe("failed");
      expect(retried.skipped).toBe(false);
      expect(retried.manifest.status).toBe("complete");
      expect(produced).toBe(2);
    } finally {
      vi.restoreAllMocks();
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("keeps the completion error and retries when both manifest writes fail", async () => {
    const runDir = await createRunDir();
    const bundleDir = join(runDir, "bundle");
    await mkdir(bundleDir);
    const manifestPath = join(runDir, "02-prompts", "manifest.json");
    const completionError = new Error("completion manifest write failed");
    let manifestWrites = 0;
    let produced = 0;
    const originalWrite = atomicWrite.writeFileAtomic;
    const writeSpy = vi
      .spyOn(atomicWrite, "writeFileAtomic")
      .mockImplementation(async (path, contents) => {
        if (path === manifestPath && ++manifestWrites === 2) {
          throw completionError;
        }
        if (path === manifestPath && manifestWrites === 3) {
          throw new Error("failed manifest write failed");
        }
        await originalWrite(path, contents);
      });
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "prompts.jsonl"), "fixture\n");
        return { counts: { rows: 1 } };
      },
    };

    try {
      await expect(runStage(options)).rejects.toBe(completionError);
      writeSpy.mockRestore();
      const failed = JSON.parse(await readFile(manifestPath, "utf8"));
      const retried = await runStage(options);

      expect(failed.status).toBe("failed");
      expect(retried.skipped).toBe(false);
      expect(retried.manifest.status).toBe("complete");
      expect(produced).toBe(2);
    } finally {
      vi.restoreAllMocks();
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("preserves a stage error when hashing its outputs also fails", async () => {
    const runDir = await createRunDir();
    const produceError = new Error("original stage failure");
    const options = {
      runDir,
      stage: "04-filter" as const,
      inputs: {},
      params: {},
      tools: {},
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        await rm(directory, { recursive: true, force: true });
        throw produceError;
      },
    };

    try {
      await expect(runStage(options)).rejects.toBe(produceError);
      const failed = JSON.parse(
        await readFile(join(runDir, "04-filter", "manifest.json"), "utf8"),
      );

      expect(failed.status).toBe("failed");
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("hashes nested directory contents as stage inputs", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const nested = join(assets, "nested");
    const bundleDir = join(runDir, "bundle");
    await mkdir(nested, { recursive: true });
    await mkdir(bundleDir);
    await writeFile(join(nested, "engine.dat"), "asset version one\n");
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async () => ({ counts: {} }),
    };

    try {
      const first = await runStage(options);
      await writeFile(join(nested, "engine.dat"), "asset version two\n");
      const changed = await runStage(options);

      expect(changed.skipped).toBe(false);
      expect(changed.manifest.inputHash).not.toBe(first.manifest.inputHash);
      expect(changed.manifest.inputs.directoryHashes[assets]).toMatch(
        /^[a-f0-9]{64}$/,
      );
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("reruns when a regular __proto__ file in a declared directory changes", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const bundleDir = join(runDir, "bundle");
    const protoPath = join(assets, "__proto__");
    await mkdir(assets);
    await mkdir(bundleDir);
    await writeFile(protoPath, "asset version one\n");
    let produced = 0;
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "positions.jsonl"), "fixture\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      const unchanged = await runStage(options);
      await writeFile(protoPath, "asset version two\n");
      const changed = await runStage(options);

      expect(unchanged.skipped).toBe(true);
      expect(changed.skipped).toBe(false);
      expect(changed.manifest.inputHash).not.toBe(first.manifest.inputHash);
      expect(produced).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("reruns when a declared __proto__ symlink target changes", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const bundleDir = join(runDir, "bundle");
    const targetPath = join(runDir, "linked-asset");
    await mkdir(assets);
    await mkdir(bundleDir);
    await writeFile(targetPath, "linked version one\n");
    await symlink(targetPath, join(assets, "__proto__"));
    let produced = 0;
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "positions.jsonl"), "fixture\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      const unchanged = await runStage(options);
      await writeFile(targetPath, "linked version two\n");
      const changed = await runStage(options);

      expect(unchanged.skipped).toBe(true);
      expect(changed.skipped).toBe(false);
      expect(changed.manifest.inputHash).not.toBe(first.manifest.inputHash);
      expect(produced).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("reruns when a directly declared file ending in __proto__ changes", async () => {
    const runDir = await createRunDir();
    const inputPath = join(runDir, "__proto__");
    await writeFile(inputPath, "direct version one\n");
    let produced = 0;
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { files: [inputPath] },
      params: {},
      tools: {},
      lockfile: null,
      produce: async () => {
        produced += 1;
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      await writeFile(inputPath, "direct version two\n");
      const changed = await runStage(options);
      const written = JSON.parse(
        await readFile(join(runDir, "01-positions", "manifest.json"), "utf8"),
      ) as { inputs: { fileHashes: Record<string, string> } };

      expect(changed.skipped).toBe(false);
      expect(changed.manifest.inputHash).not.toBe(first.manifest.inputHash);
      expect(Object.keys(written.inputs.fileHashes)).toContain(inputPath);
      expect(written.inputs.fileHashes[inputPath]).toMatch(/^[a-f0-9]{64}$/);
      expect(produced).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("hashes special output names and reads __proto__ back as an ordinary key", async () => {
    const runDir = await createRunDir();
    const bundleDir = join(runDir, "bundle");
    await mkdir(bundleDir);
    let produced = 0;
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "__proto__"), `proto-${produced}\n`);
        await writeFile(
          join(directory, "constructor"),
          `constructor-${produced}\n`,
        );
        await writeFile(join(directory, "toString"), `toString-${produced}\n`);
        await writeFile(join(directory, "stable.txt"), "stable\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      const written = JSON.parse(
        await readFile(join(runDir, "02-prompts", "manifest.json"), "utf8"),
      ) as { outputs: Record<string, string> };
      const unchanged = await runStage(options);
      await writeFile(join(runDir, "02-prompts", "__proto__"), "changed\n");
      const changedProto = await runStage(options);
      await writeFile(
        join(runDir, "02-prompts", "constructor"),
        "changed constructor\n",
      );
      const changedConstructor = await runStage(options);
      await writeFile(
        join(runDir, "02-prompts", "toString"),
        "changed toString\n",
      );
      const changedToString = await runStage(options);
      await rm(join(runDir, "02-prompts", "__proto__"));
      const deletedProto = await runStage(options);

      expect(Object.keys(first.manifest.outputs)).toContain("__proto__");
      expect(Object.keys(written.outputs)).toContain("__proto__");
      expect(Object.keys(written.outputs)).toContain("constructor");
      expect(Object.keys(written.outputs)).toContain("toString");
      expect(unchanged.skipped).toBe(true);
      expect(changedProto.skipped).toBe(false);
      expect(changedConstructor.skipped).toBe(false);
      expect(changedToString.skipped).toBe(false);
      expect(deletedProto.skipped).toBe(false);
      expect(produced).toBe(5);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("reruns when bytes at a declared file symlink change", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const bundleDir = join(runDir, "bundle");
    const targetPath = join(runDir, "engine-network.dat");
    await mkdir(assets);
    await mkdir(bundleDir);
    await writeFile(targetPath, "network version one\n");
    await symlink(targetPath, join(assets, "network.dat"));
    let produced = 0;
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "positions.jsonl"), "fixture\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      const unchanged = await runStage(options);
      await writeFile(targetPath, "network version two\n");
      const changed = await runStage(options);

      expect(first.skipped).toBe(false);
      expect(unchanged.skipped).toBe(true);
      expect(changed.skipped).toBe(false);
      expect(changed.manifest.inputHash).not.toBe(first.manifest.inputHash);
      expect(produced).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("reruns when a declared file symlink is retargeted", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const bundleDir = join(runDir, "bundle");
    const firstTarget = join(runDir, "network-one.dat");
    const secondTarget = join(runDir, "network-two.dat");
    const linkPath = join(assets, "network.dat");
    await mkdir(assets);
    await mkdir(bundleDir);
    await writeFile(firstTarget, "network one\n");
    await writeFile(secondTarget, "network two\n");
    await symlink(firstTarget, linkPath);
    let produced = 0;
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "positions.jsonl"), "fixture\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      await rm(linkPath);
      await symlink(secondTarget, linkPath);
      const retargeted = await runStage(options);

      expect(retargeted.skipped).toBe(false);
      expect(retargeted.manifest.inputHash).not.toBe(first.manifest.inputHash);
      expect(produced).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("hashes nested files reached through a declared directory symlink", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const linkedDirectory = join(runDir, "engine-network");
    const bundleDir = join(runDir, "bundle");
    await mkdir(assets);
    await mkdir(join(linkedDirectory, "nested"), { recursive: true });
    await mkdir(bundleDir);
    await writeFile(
      join(linkedDirectory, "nested", "network.dat"),
      "network version one\n",
    );
    await symlink(linkedDirectory, join(assets, "network"));
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        await writeFile(join(directory, "positions.jsonl"), "fixture\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      await writeFile(
        join(linkedDirectory, "nested", "network.dat"),
        "network version two\n",
      );
      const changed = await runStage(options);

      expect(changed.skipped).toBe(false);
      expect(changed.manifest.inputHash).not.toBe(first.manifest.inputHash);
      expect(changed.manifest.inputs.directoryHashes[assets]).not.toBe(
        first.manifest.inputs.directoryHashes[assets],
      );
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("marks directory links back to an ancestor and keeps the hash stable", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const nested = join(assets, "engine");
    const bundleDir = join(runDir, "bundle");
    await mkdir(nested, { recursive: true });
    await mkdir(bundleDir);
    await writeFile(join(nested, "network.dat"), "network\n");
    await symlink(assets, join(nested, "root-link"), "dir");
    let produced = 0;
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        produced += 1;
        await writeFile(join(directory, "positions.jsonl"), "fixture\n");
        return { counts: {} };
      },
    };

    try {
      const first = await runStage(options);
      const second = await runStage(options);

      expect(second.skipped).toBe(true);
      expect(second.manifest.inputs.directoryHashes[assets]).toBe(
        first.manifest.inputs.directoryHashes[assets],
      );
      expect(produced).toBe(1);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("rejects a dangling link in a declared directory with its path", async () => {
    const runDir = await createRunDir();
    const assets = join(runDir, "assets");
    const linkPath = join(assets, "missing-network.dat");
    await mkdir(assets);
    await symlink(join(runDir, "missing-target.dat"), linkPath);
    const options = {
      runDir,
      stage: "01-positions" as const,
      inputs: { directories: [assets] },
      params: {},
      tools: {},
      lockfile: null,
      produce: async () => ({ counts: {} }),
    };

    try {
      await expect(runStage(options)).rejects.toThrow(linkPath);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("removes stale temp files before production and excludes them from outputs", async () => {
    const runDir = await createRunDir();
    const stageDirectory = join(runDir, "02-prompts");
    const bundleDir = join(runDir, "bundle");
    await mkdir(stageDirectory, { recursive: true });
    await mkdir(bundleDir);
    const tempPath = join(stageDirectory, "prompts.jsonl.tmp-0123456789abcdef");
    await writeFile(tempPath, "stale partial data\n");
    const options = {
      runDir,
      stage: "02-prompts" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        expect(await readdir(directory)).not.toContain(
          "prompts.jsonl.tmp-0123456789abcdef",
        );
        await writeFile(join(directory, "prompts.jsonl"), "complete\n");
        return { counts: { rows: 1 } };
      },
    };

    try {
      const result = await runStage(options);

      expect(await readdir(stageDirectory)).not.toContain(
        "prompts.jsonl.tmp-0123456789abcdef",
      );
      expect(result.manifest.outputs).not.toHaveProperty(
        "prompts.jsonl.tmp-0123456789abcdef",
      );
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

  it("records partial output on failure and reruns to a complete result", async () => {
    const runDir = await createRunDir();
    const bundleDir = join(runDir, "bundle");
    await mkdir(bundleDir);
    let attempts = 0;
    const options = {
      runDir,
      stage: "04-filter" as const,
      inputs: {},
      params: {},
      tools: {},
      codeDirectory: bundleDir,
      lockfile: null,
      produce: async ({ directory }: { directory: string }) => {
        attempts += 1;
        await writeFile(join(directory, "a.jsonl"), "first output\n");
        if (attempts === 1) throw new Error("failed before b.jsonl");
        await writeFile(join(directory, "b.jsonl"), "second output\n");
        return { counts: { rows: 2 } };
      },
    };

    try {
      await expect(runStage(options)).rejects.toThrow("failed before b.jsonl");
      const failed = JSON.parse(
        await readFile(join(runDir, "04-filter", "manifest.json"), "utf8"),
      );
      const recovered = await runStage(options);

      expect(failed.status).toBe("failed");
      expect(failed.outputs).toHaveProperty("a.jsonl");
      expect(recovered.skipped).toBe(false);
      expect(recovered.manifest.status).toBe("complete");
      expect(recovered.manifest.outputs).toHaveProperty("b.jsonl");
      expect(attempts).toBe(2);
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });
});
