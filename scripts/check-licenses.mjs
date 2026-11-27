import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installedDependencies } from "./installed-dependencies.mjs";

const licenseAllowlist = new Set([
  "0BSD",
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "GPL-3.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
]);
const shipped = installedDependencies([
  "react",
  "react-dom",
  "react-chessboard",
  "lucide-react",
  "stockfish",
]);

const licenses = new Map();
for (const path of [...shipped.keys()].sort()) {
  const { name, license, version } = shipped.get(path);
  if (!licenseAllowlist.has(license))
    throw new Error(
      `Review ${name}@${version}: ${license ?? "no SPDX license"}`,
    );
  const entries = await readdir(path);
  const noticeFiles = entries
    .filter((file) =>
      /^(?:licen[cs]e|copying|notice|copyright)(?:[._-].*)?$/i.test(file),
    )
    .sort();
  if (!noticeFiles.length)
    throw new Error(`Missing license text for ${name}@${version}`);
  const texts = await Promise.all(
    noticeFiles.map((file) => readFile(join(path, file), "utf8")),
  );
  licenses.set(
    `${name}@${version} · ${license}`,
    texts.join("\n\n").replace(/\r\n/g, "\n").trim(),
  );
}

const pieceFolder = "design/assets/pieces/horsey";
const pin = JSON.parse(await readFile("scripts/horsey-source.json", "utf8"));
const pieces = (await readdir(pieceFolder))
  .filter((file) => file.endsWith(".svg"))
  .sort();
if (
  pieces.length !== 12 ||
  pieces.join() !== Object.keys(pin.sha256).sort().join()
) {
  throw new Error(
    "The horsey folder must contain exactly the twelve pinned piece files",
  );
}
for (const piece of pieces) {
  const hash = createHash("sha256")
    .update(await readFile(join(pieceFolder, piece)))
    .digest("hex");
  if (hash !== pin.sha256[piece])
    throw new Error(`${piece} differs from the pinned Lichess source`);
}

async function checkAssets(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) {
      if (path !== "public/engine") await checkAssets(path);
    } else if (
      path !== `${pieceFolder}/LICENSE.md` &&
      /\.(svg|md|txt|json|licen[cs]e)$/i.test(path)
    ) {
      const text = await readFile(path, "utf8");
      if (
        /Creative Commons[^\n]+NonCommercial|\bCC BY-NC\b|creativecommons\.org\/licenses\/by-nc/i.test(
          text,
        )
      )
        throw new Error(
          `NonCommercial asset outside the horsey exception: ${path}`,
        );
    }
  }
}
await Promise.all([checkAssets("design/assets"), checkAssets("public")]);

const stockfishVersion = shipped.get("node_modules/stockfish").version;
const notices =
  [
    "Pawnpal third-party notices",
    "",
    "Bundled assets",
    "---------------",
    `Stockfish.js ${stockfishVersion} Lite and Lite Single, GPL-3.0. The engine's corresponding source, build scripts and release files are available here:\nhttps://github.com/nmrugg/stockfish.js/tree/v${stockfishVersion}\nhttps://github.com/nmrugg/stockfish.js/releases/tag/v${stockfishVersion}`,
    `Horsey pieces by cham and michael1241, CC BY-NC-SA 4.0. The SVGs are used without changes. The artwork is separately licensed. See dist/web/licenses/horsey/LICENSE.md and https://creativecommons.org/licenses/by-nc-sa/4.0/\nSource: https://github.com/lichess-org/lila/tree/${pin.commit}/public/piece/horsey`,
    "Nunito font, SIL Open Font License 1.1. See dist/web/licenses/nunito/OFL-Nunito.txt.",
    "",
    ...[...licenses].map(
      ([heading, text]) =>
        `${heading}\n${"-".repeat(heading.length)}\n${text}\n`,
    ),
  ]
    .join("\n\n")
    .trimEnd() + "\n";

const output = "THIRD_PARTY_NOTICES";
if (process.argv.includes("--write")) await writeFile(output, notices);
else if ((await readFile(output, "utf8")).replace(/\r\n/g, "\n") !== notices) {
  throw new Error(
    `${output} is stale. Run node scripts/check-licenses.mjs --write.`,
  );
}
console.log(
  `Verified ${licenses.size} dependency licenses and all ${pieces.length} pinned horsey pieces.`,
);
