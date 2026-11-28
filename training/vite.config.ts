import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const trainingRoot = fileURLToPath(new URL(".", import.meta.url));
const stage = (file: string) => resolve(trainingRoot, "stages", file);

export default defineConfig({
  root: resolve(trainingRoot, ".."),
  plugins: [
    {
      name: "training-generated-artifact-lint-markers",
      apply: "build",
      generateBundle(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (
            output.type === "chunk" &&
            output.fileName === "01-positions.mjs"
          ) {
            output.code = `/* eslint-disable no-empty */\n${output.code}`;
          } else if (
            output.type === "chunk" &&
            output.fileName.startsWith("chunks/detectors-")
          ) {
            output.code = `/* eslint-disable */\n${output.code}`;
          }
        }
      },
      async writeBundle() {
        const engineDirectory = resolve(trainingRoot, "dist/engine/bin");
        let entries: string[];
        try {
          entries = await readdir(engineDirectory);
        } catch {
          return;
        }
        for (const entry of entries.filter((name) => name.endsWith(".js"))) {
          const path = resolve(engineDirectory, entry);
          const source = await readFile(path, "utf8");
          if (!source.startsWith("/* eslint-disable */\n")) {
            await writeFile(path, `/* eslint-disable */\n${source}`, "utf8");
          }
        }
      },
    },
  ],
  ssr: {
    external: ["stockfish"],
    noExternal: ["chess.js"],
  },
  build: {
    ssr: true,
    target: "node22",
    outDir: resolve(trainingRoot, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "00-selfplay": stage("00-selfplay.ts"),
        "01-positions": stage("01-positions.ts"),
        "02-prompts": stage("02-prompts.ts"),
        "03-teacher": stage("03-teacher.ts"),
        "04-filter": stage("04-filter.ts"),
        "05-split": stage("05-split.ts"),
        "08-evaluate": stage("08-evaluate.ts"),
      },
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
        chunkFileNames: "chunks/[name]-[hash].mjs",
      },
    },
  },
});
