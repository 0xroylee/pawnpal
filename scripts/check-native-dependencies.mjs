import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run npm run check:native");
const [, ...dependencies] = execFileSync(
  process.execPath,
  [npm, "ls", "--omit=dev", "--all", "--parseable"],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/);

const nativeFiles = [];
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (
      entry.name === "binding.gyp" ||
      /\.(?:node|so|dylib|dll)$/i.test(entry.name)
    )
      nativeFiles.push(path);
  }
}
for (const directory of dependencies) scan(directory);
if (nativeFiles.length)
  throw new Error(
    `Production dependencies contain native files:\n${nativeFiles.join("\n")}`,
  );
