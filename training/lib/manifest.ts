import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { isTempPath, writeFileAtomic } from "./atomicWrite.ts";

export const STAGE_NAMES = [
  "00-selfplay",
  "01-positions",
  "02-prompts",
  "03-teacher",
  "04-filter",
  "05-split",
  "08-evaluate",
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

export type StageOutput = {
  directory: string;
};

export type StageInputs = {
  files?: string[];
  directories?: string[];
  values?: Record<string, unknown>;
};

export type Manifest = {
  stage: StageName;
  inputHash: string;
  codeFingerprint: string;
  lockfile: string | null;
  lockfilePath: string | null;
  params: Record<string, unknown>;
  inputs: {
    fileHashes: Record<string, string>;
    directoryHashes: Record<string, string>;
    values: Record<string, unknown>;
  };
  counts: Record<string, number>;
  outputs: Record<string, string>;
  tools: Record<string, string>;
  startedAt: string;
  finishedAt: string | null;
  status: "complete" | "failed";
};

type RunStageOptions = {
  runDir: string;
  stage: StageName;
  inputs: StageInputs;
  params: Record<string, unknown>;
  tools: Record<string, string>;
  codeDirectory?: string;
  lockfile?: string | null;
  produce: (out: StageOutput) => Promise<{ counts: Record<string, number> }>;
};

export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(sortKeys(value));
  if (serialized === undefined) {
    throw new TypeError("Value must be serializable as JSON");
  }
  return serialized;
}

function createRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const sorted = createRecord<unknown>();
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeManifest(path: string, manifest: Manifest): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function readManifest(path: string): Promise<Manifest | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Manifest;
  } catch {
    return undefined;
  }
}

export async function runStage({
  runDir,
  stage,
  inputs,
  params,
  tools,
  codeDirectory,
  lockfile,
  produce,
}: RunStageOptions): Promise<{ skipped: boolean; manifest: Manifest }> {
  const fileHashes = createRecord<string>();
  for (const path of inputs.files ?? []) {
    fileHashes[path] = sha256(await readFile(path));
  }
  const directoryHashes = createRecord<string>();
  for (const path of inputs.directories ?? []) {
    directoryHashes[path] = await hashDirectory(path);
  }

  const manifestInputs = {
    fileHashes,
    directoryHashes,
    values: inputs.values ?? {},
  };
  const bundleDirectory =
    codeDirectory ?? dirname(resolve(process.argv[1] ?? process.cwd()));
  const bunLock = resolve(bundleDirectory, "../../bun.lock");
  const lockfilePath =
    lockfile === undefined
      ? (await hashOptionalFile(bunLock))
        ? bunLock
        : resolve(bundleDirectory, "../../package-lock.json")
      : lockfile;
  const lockfileHash = lockfilePath
    ? await hashOptionalFile(lockfilePath)
    : null;
  const codeFingerprint = await fingerprintBundle(
    bundleDirectory,
    lockfileHash,
  );
  const inputHash = sha256(
    canonicalJson({
      fileHashes,
      directoryHashes,
      values: manifestInputs.values,
      params,
      tools,
      codeFingerprint,
    }),
  );
  const stageDirectory = join(runDir, stage);
  const manifestPath = join(stageDirectory, "manifest.json");
  await mkdir(stageDirectory, { recursive: true });
  await removeTempFiles(stageDirectory);

  const existing = await readManifest(manifestPath);
  const existingOutputs =
    existing?.outputs &&
    typeof existing.outputs === "object" &&
    !Array.isArray(existing.outputs)
      ? existing.outputs
      : undefined;
  const currentOutputs = await hashOutputFiles(stageDirectory);
  const outputsMatch =
    existingOutputs !== undefined &&
    Object.keys(existingOutputs).length > 0 &&
    canonicalJson(existingOutputs) === canonicalJson(currentOutputs);
  if (
    existing?.stage === stage &&
    existing.status === "complete" &&
    existing.inputHash === inputHash &&
    outputsMatch
  ) {
    return { skipped: true, manifest: existing };
  }

  const manifest: Manifest = {
    stage,
    inputHash,
    codeFingerprint,
    lockfile: lockfileHash,
    lockfilePath,
    params,
    inputs: manifestInputs,
    counts: {},
    outputs: {},
    tools,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "failed",
  };

  // Persist a failed status before producing outputs so an interrupted stage is rerun.
  await writeManifest(manifestPath, manifest);

  try {
    const result = await produce({ directory: stageDirectory });
    manifest.counts = result.counts;
    manifest.outputs = await hashOutputFiles(stageDirectory);
    manifest.finishedAt = new Date().toISOString();
    manifest.status = "complete";
    await writeManifest(manifestPath, manifest);
    return { skipped: false, manifest };
  } catch (error) {
    manifest.status = "failed";
    manifest.finishedAt = new Date().toISOString();
    try {
      manifest.outputs = await hashOutputFiles(stageDirectory);
    } catch {
      // Preserve the error that caused the stage to fail.
    }
    try {
      await writeManifest(manifestPath, manifest);
    } catch {
      // The initial failed manifest remains on disk when an atomic write fails.
    }
    throw error;
  }
}

async function fingerprintBundle(
  directory: string,
  lockfile: string | null,
): Promise<string> {
  const files: string[] = [];
  async function visit(currentDirectory: string, isRoot: boolean) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(currentDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Unsupported code bundle link at ${path}`);
      }
      if (entry.isDirectory()) {
        await visit(path, false);
      } else if (isRoot && entry.isFile() && entry.name.endsWith(".mjs")) {
        files.push(entry.name);
      }
    }
  }

  await visit(directory, true);
  files.sort();
  const fileHashes = createRecord<string>();
  for (const file of files) {
    fileHashes[file] = sha256(await readFile(join(directory, file)));
  }
  return sha256(canonicalJson({ bundle: fileHashes, lockfile }));
}

async function hashDirectory(directory: string): Promise<string> {
  const fileHashes = createRecord<string>();

  async function visit(
    currentDirectory: string,
    currentRelativePath: string,
    ancestorRealPaths: Set<string>,
  ): Promise<void> {
    const currentRealPath = await realpath(currentDirectory);
    if (ancestorRealPaths.has(currentRealPath)) {
      fileHashes[currentRelativePath] = "cycle";
      return;
    }
    const currentAncestors = new Set(ancestorRealPaths);
    currentAncestors.add(currentRealPath);
    const entries = (await readdir(currentDirectory, { withFileTypes: true }))
      .slice()
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(currentDirectory, entry.name);
      const entryRelativePath = currentRelativePath
        ? join(currentRelativePath, entry.name)
        : entry.name;
      if (entry.isDirectory()) {
        await visit(path, entryRelativePath, currentAncestors);
      } else if (entry.isFile()) {
        fileHashes[entryRelativePath] = sha256(await readFile(path));
      } else if (entry.isSymbolicLink()) {
        let targetStats;
        try {
          targetStats = await stat(path);
        } catch (error) {
          throw new Error(
            `Unable to read declared asset at ${path}: ${(error as Error).message}`,
            { cause: error },
          );
        }
        if (targetStats.isDirectory()) {
          await visit(path, entryRelativePath, currentAncestors);
        } else if (targetStats.isFile()) {
          fileHashes[entryRelativePath] = sha256(await readFile(path));
        } else {
          throw new Error(`Unsupported declared asset at ${path}`);
        }
      } else {
        throw new Error(`Unsupported declared asset at ${path}`);
      }
    }
  }

  await visit(directory, "", new Set());
  return sha256(canonicalJson(fileHashes));
}

async function hashOptionalFile(path: string): Promise<string | null> {
  try {
    return sha256(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function removeTempFiles(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await removeTempFiles(path);
    } else if (entry.isFile() && isTempPath(path)) {
      await rm(path, { force: true });
    }
  }
}

async function hashOutputFiles(
  directory: string,
): Promise<Record<string, string>> {
  const outputHashes = createRecord<string>();
  async function visit(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        if (path !== join(directory, "manifest.json") && !isTempPath(path)) {
          outputHashes[relative(directory, path)] = sha256(
            await readFile(path),
          );
        }
      } else {
        throw new Error(`Unsupported stage output at ${path}`);
      }
    }
  }

  await visit(directory);
  const sortedOutputHashes = createRecord<string>();
  for (const [path, hash] of Object.entries(outputHashes).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    sortedOutputHashes[path] = hash;
  }
  return sortedOutputHashes;
}
