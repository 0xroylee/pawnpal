import { readdirSync } from "node:fs";
import { join } from "node:path";
import { installedDependencies } from "./installed-dependencies.mjs";

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
for (const directory of installedDependencies().keys()) scan(directory);
if (nativeFiles.length)
  throw new Error(
    `Production dependencies contain native files:\n${nativeFiles.join("\n")}`,
  );
