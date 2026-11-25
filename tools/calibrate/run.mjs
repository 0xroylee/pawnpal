import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  appType: "custom",
  server: { middlewareMode: true, watch: null, ws: false },
});

try {
  if (process.argv[2] !== "--match-worker") {
    await runCalibration();
  } else {
    const batch = await new Promise((resolve) =>
      process.once("message", resolve),
    );
    const { createMatchRunner } = await server.ssrLoadModule(
      "/tools/calibrate/matches.ts",
    );
    const runner = await createMatchRunner();
    try {
      for (const { id, match } of batch) {
        process.send({ id, ...(await runner.play(match)) });
      }
    } finally {
      runner.close();
      process.disconnect();
    }
  }
} finally {
  await server.close();
}

async function runCalibration() {
  const { values } = parseArgs({
    options: {
      workers: {
        type: "string",
        default: String(Math.min(10, availableParallelism())),
      },
      openings: { type: "string", default: "50" },
      repeats: { type: "string", default: "2" },
    },
  });
  const workers = integer(values.workers, 1, 32, "workers");
  const openingCount = integer(values.openings, 1, 50, "openings");
  const repeats = integer(values.repeats, 1, 2, "repeats");
  const fullRun = openingCount === 50 && repeats === 2;
  const [{ openings }, { samplingPolicies, dragonElo }, { plyLimit }] =
    await Promise.all([
      server.ssrLoadModule("/tools/calibrate/openings.ts"),
      server.ssrLoadModule("/src/web/engine/levels.ts"),
      server.ssrLoadModule("/tools/calibrate/matches.ts"),
    ]);

  const pairs = Array.from({ length: 7 }, (_, index) => [index + 2, index + 1]);
  pairs.push([8, "anchor"]);
  const counts = pairs.map(() => ({ wins: 0, draws: 0, losses: 0, capped: 0 }));
  const jobs = [];
  // Rotate through pairings so progress covers the full ladder as games finish.
  for (let repeat = 0; repeat < repeats; repeat++) {
    for (const [index, opening] of openings.slice(0, openingCount).entries()) {
      for (const [pair, [stronger, weaker]] of pairs.entries()) {
        for (const side of ["w", "b"]) {
          const match = {
            opening,
            white: stronger,
            black: weaker,
            seed: 200_000 * (pair + 1) + 2_000 * repeat + 2 * index,
          };
          if (side === "b") {
            [match.white, match.black] = [match.black, match.white];
            match.seed++;
          }
          jobs.push({ id: jobs.length, pair, side, match });
        }
      }
    }
  }
  const engineVersion = JSON.parse(
    await readFile("node_modules/stockfish/package.json", "utf8"),
  ).version;
  const openingHash = createHash("sha256")
    .update(openings.slice(0, openingCount).join("\n"))
    .digest("hex");
  const workerCount = Math.min(workers, jobs.length);
  let finished = 0;
  const results = new Set();
  const started = Date.now();
  await Promise.all(
    Array.from(
      { length: workerCount },
      (_, workerIndex) =>
        new Promise((resolve, reject) => {
          const batch = jobs.filter(
            ({ id }) => id % workerCount === workerIndex,
          );
          const worker = fork(fileURLToPath(import.meta.url), [
            "--match-worker",
          ]);
          worker.send(batch);
          worker.on("message", ({ id, winner, capped }) => {
            const { side, pair } = jobs[id];
            results.add(id);
            const count = counts[pair];
            if (winner === "draw") count.draws++;
            else if (winner === side) count.wins++;
            else count.losses++;
            if (capped) count.capped++;
            finished++;
            if (finished % 16 === 0 || finished === jobs.length) {
              const scores = counts
                .map((entry) => (score(entry) * 100).toFixed(0))
                .join("/");
              console.log(
                `${finished}/${jobs.length} games after ${Math.round((Date.now() - started) / 1000)}s · scores ${scores}%`,
              );
            }
          });
          worker.once("error", reject);
          worker.once("exit", (status) => {
            if (status === 0 && batch.every(({ id }) => results.has(id)))
              resolve();
            else
              reject(
                new Error(
                  `Calibration worker stopped before finishing its games (exit ${status})`,
                ),
              );
          });
        }),
    ),
  );

  const summary = [
    "| Pair (level first) | Wins | Draws | Losses | Capped draws | Score | Target | Result |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  ];
  let passes = true;
  for (const [index, count] of counts.entries()) {
    const anchor = index === counts.length - 1;
    const points = score(count);
    const pass = anchor ? points >= 0.4 && points <= 0.6 : points >= 0.6;
    passes &&= pass;
    const [stronger, weaker] = pairs[index];
    summary.push(
      `| ${stronger} vs ${anchor ? "Stockfish 1320" : weaker} | ${count.wins} | ${count.draws} | ${count.losses} | ${count.capped} | ${(100 * points).toFixed(1)}% | ${anchor ? "40–60%" : "≥60%"} | ${fullRun ? (pass ? "Pass" : "Fail") : "Pilot"} |`,
    );
  }

  const table = [
    "| Level | MultiPV | Depth | Temperature | Slip chance | Slip loss (cp) | Capture bonus (cp) |",
    "| ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...Object.entries(samplingPolicies).map(
      ([level, policy]) =>
        `| ${level} | ${policy.multiPv} | ${policy.depth} | ${policy.temperature} | ${policy.slipProbability} | ${policy.slipLoss?.join("–") ?? "Any legal move"} | ${policy.captureBonus} |`,
    ),
  ];
  const day = new Date().toISOString().slice(0, 10);
  const report = [
    `# Difficulty calibration — ${day}`,
    "",
    fullRun
      ? `**Calibration ${passes ? "passed" : "failed"}.**`
      : "**Pilot run.**",
    "",
    `Stockfish ${engineVersion} lite-single WASM on ${process.platform} ${process.arch}, Node ${process.version}. ${openingCount} opening positions, both colors, ${repeats} repeats per opening and color. At ${plyLimit} plies after the opening, unfinished games count as draws. Score is wins plus half of draws divided by games.`,
    "",
    `Opening-position SHA-256 \`${openingHash}\`. Move sampling uses seeded randomness. Stockfish supplies its own randomness for Elo-limited moves. Ratings below 1320 cannot be anchored precisely with this setup.`,
    "",
    ...summary,
    "",
    ...table,
    "",
    `Dragon uses Stockfish's Elo limit of ${dragonElo}. The anchor uses the same depth and time limits at Elo 1320.`,
    "",
  ].join("\n");

  const directory = new URL("./results/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const reportPath = new URL(`${day}${fullRun ? "" : "-pilot"}.md`, directory);
  await writeFile(reportPath, await format(report, { parser: "markdown" }));
  console.log(summary.join("\n"));
  console.log(`Saved ${reportPath.pathname}`);
  if (fullRun && !passes) process.exitCode = 1;
}

function integer(value, min, max, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`--${flag} must be an integer from ${min} through ${max}`);
  }
  return number;
}

function score({ wins, draws, losses }) {
  const games = wins + draws + losses;
  return games === 0 ? 0 : (wins + draws / 2) / games;
}
