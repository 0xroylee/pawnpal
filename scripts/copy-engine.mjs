import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageRoot = resolve(repositoryRoot, "node_modules/stockfish");
const outputRoot = resolve(repositoryRoot, "public/engine");
const enginePattern = /lite.*\.(?:js|wasm)$/i;

async function listFiles(directory, baseDirectory = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath, baseDirectory)));
    } else if (entry.isFile()) {
      files.push(relative(baseDirectory, entryPath));
    }
  }

  return files;
}

let packageFiles = [];
try {
  packageFiles = await listFiles(packageRoot);
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const engineFiles = packageFiles
  .filter(
    (file) =>
      enginePattern.test(basename(file)) &&
      [".js", ".wasm"].includes(extname(file).toLowerCase()),
  )
  .sort();

function findBuildFiles(kind) {
  const suffix = kind === "lite-single" ? "lite-single" : "lite";
  const matcher = new RegExp(`^stockfish-\\d+-${suffix}\\.(js|wasm)$`, "i");
  const files = engineFiles.filter((file) => matcher.test(basename(file)));
  const js = files.find((file) => extname(file).toLowerCase() === ".js");
  const wasm = files.find((file) => extname(file).toLowerCase() === ".wasm");
  return js && wasm ? { js: basename(js), wasm: basename(wasm) } : null;
}

const engineBuilds = {
  lite: findBuildFiles("lite"),
  "lite-single": findBuildFiles("lite-single"),
};

if (
  engineFiles.length === 0 ||
  Object.values(engineBuilds).some((build) => build === null)
) {
  console.error(
    "Stockfish lite builds need matching JavaScript and WASM files.",
  );
  console.error("Files found in the Stockfish package:");
  if (packageFiles.length === 0) {
    console.error("  (package directory is missing or empty)");
  } else {
    for (const file of packageFiles) {
      console.error(`  ${file}`);
    }
  }
  process.exitCode = 1;
} else {
  let currentOutputFiles = [];
  try {
    currentOutputFiles = await listFiles(outputRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const isCurrent =
    currentOutputFiles.length === engineFiles.length &&
    engineFiles.every((file) => currentOutputFiles.includes(file));
  const contentsMatch =
    isCurrent &&
    (
      await Promise.all(
        engineFiles.map(async (file) => {
          const [source, destination] = await Promise.all([
            readFile(resolve(packageRoot, file)),
            readFile(resolve(outputRoot, file)),
          ]);
          return source.equals(destination);
        }),
      )
    ).every(Boolean);

  if (!contentsMatch) {
    await rm(outputRoot, { recursive: true, force: true });
    await mkdir(outputRoot, { recursive: true });
    for (const file of engineFiles) {
      const source = resolve(packageRoot, file);
      const destination = resolve(outputRoot, file);
      await mkdir(resolve(destination, ".."), { recursive: true });
      await cp(source, destination);
      console.log(`Copied ${file} -> public/engine/${file}`);
    }
  } else {
    for (const file of engineFiles) {
      console.log(`Already current ${file} -> public/engine/${file}`);
    }
  }

  const configPath = resolve(
    repositoryRoot,
    "src/web/engine/engine-files.json",
  );
  const configContents = `${JSON.stringify(engineBuilds, null, 2)}\n`;
  let existingConfig = "";
  try {
    existingConfig = await readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (existingConfig !== configContents)
    await writeFile(configPath, configContents);
}
