import { execFileSync, fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCli = process.env.npm_execpath;
if (!npmCli)
  throw new Error(
    "Run this check with npm run check:pack or npm run smoke:package.",
  );
const npm = (args, cwd = root) =>
  execFileSync(process.execPath, [npmCli, ...args], {
    cwd,
    encoding: "utf8",
    timeout: 180_000,
  });
const [pack] = JSON.parse(npm(["pack", "--dry-run", "--json"]));
const allowed = new Set([
  "LICENSE",
  "README.md",
  "THIRD_PARTY_NOTICES",
  "package.json",
]);
const required = [
  ...allowed,
  "bin/pawnpal.js",
  "dist/server/main.js",
  "dist/web/index.html",
  "dist/web/pawnpal.webmanifest",
  "dist/web/licenses/horsey/LICENSE.md",
];
for (const file of pack.files) {
  if (!allowed.has(file.path) && !/^(bin|dist)\//.test(file.path))
    throw new Error(`Unexpected file in tarball: ${file.path}`);
}
for (const file of required) {
  if (!pack.files.some(({ path }) => path === file))
    throw new Error(`Missing from tarball: ${file}`);
}
if (pack.unpackedSize > 20_000_000)
  throw new Error(`Tarball exceeds 20 MB: ${pack.unpackedSize} bytes unpacked`);
console.log(
  `${pack.name}@${pack.version}: ${pack.files.length} files, ${pack.unpackedSize} bytes unpacked.`,
);
if (!process.argv.includes("--dry-run")) await smoke();

async function smoke() {
  const scratch = await mkdtemp(join(tmpdir(), "pawnpal-package-"));
  let child;
  try {
    const [artifact] = JSON.parse(
      npm(["pack", "--json", "--pack-destination", scratch]),
    );
    await writeFile(join(scratch, "package.json"), '{"private":true}\n');
    npm(
      [
        "install",
        "--omit=dev",
        "--no-audit",
        "--no-fund",
        join(scratch, artifact.filename),
      ],
      scratch,
    );
    const help = npm(["exec", "--offline", "--", "pawnpal", "--help"], scratch);
    if (!help.includes("Usage: pawnpal"))
      throw new Error("The installed npm executable did not start");

    // Windows has no signal delivery for child.kill('SIGINT'). Emit SIGINT
    // inside that process so the same shutdown handler runs on every platform.
    const windows = process.platform === "win32";
    const bridge = join(scratch, "signal.cjs");
    if (windows)
      await writeFile(
        bridge,
        "process.once('message', () => { process.disconnect(); process.emit('SIGINT'); });\n",
      );
    child = fork(
      join(scratch, "node_modules/pawnpal/bin/pawnpal.js"),
      ["--no-open", "--port", "0"],
      {
        cwd: scratch,
        env: { ...process.env, PAWNPAL_HOME: join(scratch, "data") },
        execArgv: windows ? ["--require", bridge] : [],
        stdio: ["ignore", "pipe", "inherit", "ipc"],
      },
    );
    const exited = once(child, "exit");
    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("The installed Pawnpal server did not start")),
        15_000,
      );
      let stdout = "";
      child.stdout.setEncoding("utf8").on("data", (data) => {
        stdout += data;
        const url = /pawnpal is running at (http:\/\/127\.0\.0\.1:\d+)/.exec(
          stdout,
        )?.[1];
        if (url) {
          clearTimeout(timeout);
          resolve(url);
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`Pawnpal stopped before readiness (exit ${code})`));
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok || (await response.json()).version !== pack.version)
      throw new Error("The installed tarball failed its health check");
    if (windows) child.send("SIGINT");
    else child.kill("SIGINT");
    const [code, signal] = await exited;
    if (code !== 0 || signal)
      throw new Error(`Pawnpal shut down with exit ${code} (${signal})`);
    console.log(
      "The installed tarball passed its health check and exited cleanly on SIGINT.",
    );
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, "exit");
      child.kill("SIGKILL");
      await stopped;
    }
    await rm(scratch, { recursive: true, force: true });
  }
}
