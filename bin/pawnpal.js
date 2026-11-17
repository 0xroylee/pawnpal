#!/usr/bin/env node

import { isNodeVersionSupported } from "./node-version.js";

if (!isNodeVersionSupported(process.version, "22.13.0")) {
  console.error(
    `pawnpal needs Node 22.13 or newer. You have ${process.version}. Download it from https://nodejs.org`,
  );
  process.exit(1);
}

import("../dist/server/cli.js")
  .then((module) => module.run(process.argv.slice(2)))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
