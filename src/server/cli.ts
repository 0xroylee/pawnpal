import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { isNodeVersionSupported } from "../../bin/node-version.js";
import { createApp } from "./app.ts";
import { parentPinKey } from "./parent/gate.ts";
import { lanSetting, lanUrls, type NetworkMode } from "./network.ts";

export type ParsedArgs = {
  port: number | null;
  open: boolean;
  help: boolean;
  lan?: true;
};
export type ServerHandle = { port: number; close: () => void | Promise<void> };
export type CliDeps = {
  tryListen?: (port: number) => Promise<boolean>;
  serveApp?: (
    app: Hono,
    port: number,
    host: string,
  ) => ServerHandle | Promise<ServerHandle>;
  openBrowser?: (url: string) => void | Promise<void>;
  log?: (message: string) => void;
  error?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
  installSignals?: boolean;
};

const usage =
  "Usage: pawnpal [--port <port>] [--no-open] [--lan] [--help]\n       pawnpal reset-pin";
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
// How long a stopping server waits for requests in flight before it drops
// the remaining connections.
const CLOSE_GRACE_MS = 500;
const version = (
  JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
    version: string;
  }
).version;

export function parseArgs(argv: string[]): ParsedArgs {
  let port: number | null = 4747;
  let open = true;
  let help = false;
  let lan = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--no-open") {
      open = false;
    } else if (argument === "--lan") {
      lan = true;
    } else if (argument === "--port") {
      const rawPort = argv[index + 1];
      if (rawPort === undefined || !/^\d+$/.test(rawPort)) {
        throw new Error("--port must be an integer from 0 to 65535");
      }
      port = Number(rawPort);
      index += 1;
    } else if (argument.startsWith("--port=")) {
      const rawPort = argument.slice("--port=".length);
      if (!/^\d+$/.test(rawPort))
        throw new Error("--port must be an integer from 0 to 65535");
      port = Number(rawPort);
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (port !== null && (port < 0 || port > 65535)) {
      throw new Error("--port must be an integer from 0 to 65535");
    }
  }

  return { port, open, help, ...(lan ? { lan: true as const } : {}) };
}

export function checkNodeVersion(version: string, minimum = "22.13.0") {
  const ok = isNodeVersionSupported(version, minimum);
  return {
    ok,
    ...(!ok
      ? {
          message: `pawnpal needs Node ${minimum.replace(/^v/, "").split(".").slice(0, 2).join(".")} or newer. You have ${version}. Download it from https://nodejs.org`,
        }
      : {}),
  };
}

export async function findPort({
  preferred,
  attempts = 11,
  tryListen = canListen,
}: {
  preferred: number;
  attempts?: number;
  tryListen?: (port: number) => Promise<boolean>;
}): Promise<number> {
  if (preferred === 0) return 0;
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = preferred + offset;
    if (candidate > 65535) break;
    if (await tryListen(candidate)) return candidate;
  }
  const last = Math.min(65535, preferred + attempts - 1);
  throw new Error(`Could not find an open port from ${preferred} to ${last}`);
}

async function canListen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const server = createServer();
    server.once("error", () => resolveProbe(false));
    server.listen(port, host, () => {
      server.close(() => resolveProbe(true));
    });
  });
}

async function serveApp(
  app: Hono,
  port: number,
  hostname: string,
): Promise<ServerHandle> {
  const server = serve({ fetch: app.fetch, hostname, port });
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server did not bind to a TCP port");
  return {
    port: address.port,
    close: () =>
      new Promise<void>((closeResolve, closeReject) => {
        // Browsers open spare connections before they send a request, and
        // close() waits for them, so Ctrl+C could leave pawnpal running. Let
        // requests in flight finish, then drop whatever is still open.
        const force = setTimeout(() => {
          if ("closeAllConnections" in server) server.closeAllConnections();
        }, CLOSE_GRACE_MS);
        server.close((error) => {
          clearTimeout(force);
          if (error) closeReject(error);
          else closeResolve();
        });
      }),
  };
}

async function openBrowser(url: string): Promise<void> {
  const opener = await import("open");
  await opener.default(url);
}

async function loadLibrary() {
  const emitWarning = process.emitWarning;
  process.emitWarning = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].startsWith("SQLite is an experimental feature") &&
      args[1] === "ExperimentalWarning"
    )
      return;
    Reflect.apply(emitWarning, process, args);
  };
  try {
    return await import("./db/library.ts");
  } finally {
    process.emitWarning = emitWarning;
  }
}

export async function run(
  argv: string[],
  dependencies: CliDeps = {},
): Promise<ServerHandle | null> {
  const log = dependencies.log ?? console.log;
  const reportError = dependencies.error ?? console.error;
  if (argv.length === 1 && argv[0] === "reset-pin") {
    const { openLibrary } = await loadLibrary();
    const library = openLibrary({
      home: (dependencies.env ?? process.env).PAWNPAL_HOME,
    });
    try {
      library.clearSetting(parentPinKey);
    } finally {
      library.close();
    }
    log("Parent PIN cleared. Open parent settings to set a new PIN.");
    return null;
  }
  const args = parseArgs(argv);
  if (args.help) {
    log(usage);
    return null;
  }

  const check = checkNodeVersion(process.version);
  if (!check.ok) {
    reportError(check.message ?? "Unsupported Node version");
    process.exitCode = 1;
    return null;
  }

  const env = dependencies.env ?? process.env;
  const { openLibrary } = await loadLibrary();
  const library = openLibrary({ home: env.PAWNPAL_HOME });
  let enabled = args.lan === true || library.getSetting(lanSetting) === "true";
  const hostFor = (lan: boolean) => (lan ? "0.0.0.0" : "127.0.0.1");
  let port = args.port ?? 4747;
  let listening: ServerHandle | undefined;
  let transitioning: Promise<void> | undefined;
  let closed: Promise<void> | undefined;
  let failed = false;
  const listen = dependencies.serveApp ?? serveApp;
  const printLan = () => {
    for (const url of lanUrls(port)) log(`Pawnpal on your Wi-Fi: ${url}`);
  };
  const network: NetworkMode = {
    current: () => ({
      enabled,
      port,
      changing: Boolean(transitioning),
      failed,
    }),
    set(next) {
      if (closed || transitioning || next === enabled) return;
      failed = false;
      // Closing waits for the settings request to finish sending its response.
      transitioning = new Promise<void>((resolve) => setImmediate(resolve))
        .then(async () => {
          if (closed) return;
          const old = listening;
          try {
            await old?.close();
            listening = undefined;
            listening = await listen(app, port, hostFor(next));
            library.setSetting(lanSetting, String(next));
            enabled = next;
            if (enabled) printLan();
          } catch (error) {
            failed = true;
            reportError(
              `Pawnpal couldn't change network mode: ${String(error)}`,
            );
            if (!listening) {
              listening = await Promise.resolve()
                .then(() => listen(app, port, hostFor(enabled)))
                .catch(() => undefined);
            }
          }
        })
        .finally(() => {
          transitioning = undefined;
        });
    },
  };
  const app = createApp({
    version,
    staticDir: resolve(packageRoot, "dist/web"),
    dev: env.PAWNPAL_DEV === "1",
    coi: env.PAWNPAL_NO_COI !== "1",
    library,
    apiDependencies: { network },
  });
  try {
    port = await findPort({
      preferred: port,
      tryListen:
        dependencies.tryListen ?? ((port) => canListen(port, hostFor(enabled))),
    });
    listening = await listen(app, port, hostFor(enabled));
    port = listening.port;
    if (args.lan) library.setSetting(lanSetting, "true");
  } catch (error) {
    await listening?.close();
    library.close();
    throw error;
  }
  const server: ServerHandle = {
    port,
    close: () =>
      (closed ??= Promise.resolve(transitioning)
        .then(async () => {
          await listening?.close();
        })
        .finally(() => library.close())),
  };
  const url = `http://127.0.0.1:${server.port}`;
  log(`pawnpal is running at ${url}`);
  if (enabled) printLan();
  log("Press Ctrl+C to stop");
  if (args.open) {
    try {
      await (dependencies.openBrowser ?? openBrowser)(url);
    } catch (error) {
      await server.close();
      throw error;
    }
  }

  if (dependencies.installSignals !== false) {
    const stop = async () => {
      await server.close();
      process.exitCode = 0;
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
  return server;
}
