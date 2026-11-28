import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, sep } from "node:path";

const root = realpathSync(process.cwd());
const readManifest = (directory) =>
  JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));

export function installedDependencies(bundled = []) {
  const installed = new Map();
  const project = readManifest(root);

  function visit(name, parent, optional = false) {
    const require = createRequire(join(parent, "package.json"));
    // Package manifests may be hidden by the package's exports map.
    const modules = require.resolve
      .paths(`${name}/package.json`)
      .find(
        (directory) =>
          directory.startsWith(root + sep) &&
          existsSync(join(directory, name, "package.json")),
      );
    if (!modules) {
      if (optional) return;
      throw new Error(`Missing dependency ${name} required by ${parent}`);
    }

    const directory = realpathSync(join(modules, name));
    const path = relative(root, directory).split(sep).join("/");
    if (installed.has(path)) return;
    const manifest = readManifest(directory);
    installed.set(path, manifest);

    visitDependencies(manifest, directory);
    for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
      const optional = manifest.peerDependenciesMeta?.[peer]?.optional;
      if (optional && peer.startsWith("@types/")) continue;
      visit(peer, directory, optional);
    }
  }

  function visitDependencies(manifest, parent) {
    const optional = manifest.optionalDependencies ?? {};
    for (const name of Object.keys({ ...manifest.dependencies, ...optional }))
      visit(name, parent, Object.hasOwn(optional, name));
  }

  visitDependencies(project, root);
  for (const name of bundled) visit(name, root);
  return installed;
}
