import {
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runStage } from "./manifest.ts";
import { createTrainingEngine, resolveWasmEngineFiles } from "./engine.ts";

const fakeUciPath = fileURLToPath(
  new URL("../test/fake-uci.mjs", import.meta.url),
);

const canLaunchShebang = process.platform !== "win32";

describe("createTrainingEngine", () => {
  it.skipIf(!canLaunchShebang)(
    "hashes script bytes and its declared directory assets after initialization",
    async () => {
      const root = join(process.cwd(), "training/runs");
      await mkdir(root, { recursive: true });
      const runDir = await mkdtemp(join(root, "engine-inputs-"));
      const command = join(runDir, "fake-uci.mjs");
      const bundleDir = join(runDir, "bundle");
      const chessAssets = join(process.cwd(), "node_modules/chess.js");
      await copyFile(fakeUciPath, command);
      await chmod(command, 0o755);
      await mkdir(bundleDir);
      const engine = createTrainingEngine({
        engine: { uci: command },
        assets: [chessAssets],
      });

      try {
        await engine.client.init();
        const inputs = await engine.describeInputs();

        expect(inputs.values.executableKind).toBe("script");
        expect(inputs.values.uciBanner).toContain("id name PawnPal Fake UCI");
        expect(inputs.files).toContain(command);
        expect(inputs.directories).toContain(chessAssets);

        const options = {
          runDir,
          stage: "01-positions" as const,
          inputs: {
            files: inputs.files,
            directories: inputs.directories,
            values: { engine: inputs.values },
          },
          params: { engine: command },
          tools: { engine: engine.name },
          codeDirectory: bundleDir,
          lockfile: null,
          produce: async ({ directory }: { directory: string }) => {
            await writeFile(join(directory, "positions.jsonl"), "facts\n");
            return { counts: { rows: 1 } };
          },
        };
        await runStage(options);
        await appendFile(command, "\n// changed engine bytes\n", "utf8");
        const changed = await runStage({
          ...options,
          inputs: {
            files: inputs.files,
            directories: inputs.directories,
            values: { engine: inputs.values },
          },
        });

        expect(changed.skipped).toBe(false);
      } finally {
        engine.client.terminate();
        await rm(runDir, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(!canLaunchShebang)(
    "refuses scripts with no declared runtime assets or operator identity",
    async () => {
      const engine = createTrainingEngine({ engine: { uci: fakeUciPath } });

      try {
        await engine.client.init();
        await expect(engine.describeInputs()).rejects.toThrow(
          `Engine ${fakeUciPath} is a script; its real inputs (interpreter, imports, wrapped binary, nets) cannot be fingerprinted. Pass --engine-assets <path,...> and/or --engine-identity <label>.`,
        );
      } finally {
        engine.client.terminate();
      }
    },
  );

  it("does not describe inputs before init resolves", async () => {
    const engine = createTrainingEngine({ engine: { uci: fakeUciPath } });

    try {
      await expect(engine.describeInputs()).rejects.toThrow(
        "Engine inputs are not known before init()",
      );
    } finally {
      engine.client.terminate();
    }
  });

  it("resolves the actual Stockfish WASM runtime files", () => {
    const files = resolveWasmEngineFiles();

    expect(files.at(-3)).toMatch(/stockfish-19-lite-single\.js$/);
    expect(files.at(-2)).toMatch(/stockfish-19-lite-single\.wasm$/);
    expect(files.at(-1)?.endsWith(join("stockfish", "package.json"))).toBe(
      true,
    );
  });

  it("terminates pending client work and exposes spawn failure details", async () => {
    const engine = createTrainingEngine({
      engine: { uci: "pawnpal-no-such-training-engine-im18" },
    });

    try {
      await expect(engine.client.init()).rejects.toMatchObject({
        code: "transport-closed",
      });
      expect(engine.failureCause).toContain("spawn error");
    } finally {
      engine.client.terminate();
    }
  });
});
