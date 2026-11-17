import { spawn, spawnSync } from "node:child_process";

const copyResult = spawnSync(process.execPath, ["scripts/copy-engine.mjs"], {
  stdio: "inherit",
});

if (copyResult.status !== 0) {
  process.exit(copyResult.status ?? 1);
}

const env = {
  ...process.env,
  PAWNPAL_DEV: "1",
};
const children = [
  spawn("vite", [], { env, stdio: "inherit" }),
  spawn(
    process.execPath,
    ["--experimental-strip-types", "--watch", "src/server/main.ts"],
    { env, stdio: "inherit" },
  ),
];
let shuttingDown = false;

function stopChildren(signal = "SIGTERM") {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopChildren(signal));
}

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stopChildren();
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      process.exitCode = code ?? 1;
      stopChildren();
    }
  });
}
