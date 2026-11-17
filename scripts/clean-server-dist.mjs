import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
await rm(resolve(repositoryRoot, "dist/server"), {
  recursive: true,
  force: true,
});
