import { createServer } from "node:net";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { isNodeVersionSupported } from "../../bin/node-version.js";
import { createApp } from "./app.ts";

export type ParsedArgs = { port: number | null; open: boolean; help: boolean };
export type ServerHandle = { port: number; close: () => void | Promise<void> };
export type CliDeps = {
  tryListen?: (port: number) => Promise<boolean>;
  serveApp?: (app: Hono, port: number) => ServerHandle | Promise<ServerHandle>;
  openBrowser?: (url: string) => void | Promise<void>;
  log?: (message: string) => void;
  error?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
  installSignals?: boolean;
};

const usage = "Usage: pawnpal [--port <port>] [--no-open] [--help]";
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

export function parseArgs(argv: string[]): ParsedArgs {
  let port: number | null = 4747;
  let open = true;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument === "--no-open") {
      open = false;
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

  return { port, open, help };
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

async function canListen(port: number): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const server = createServer();
    server.once("error", () => resolveProbe(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolveProbe(true));
    });
  });
}

async function serveApp(app: Hono, port: number): Promise<ServerHandle> {
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
  if (!server.listening) await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server did not bind to a TCP port");
  return {
    port: address.port,
    close: () =>
      new Promise<void>((closeResolve, closeReject) => {
        server.close((error) => (error ? closeReject(error) : closeResolve()));
      }),
  };
}

async function openBrowser(url: string): Promise<void> {
  const opener = await import("open");
  await opener.default(url);
}

export async function run(
  argv: string[],
  dependencies: CliDeps = {},
): Promise<ServerHandle | null> {
  const log = dependencies.log ?? console.log;
  const reportError = dependencies.error ?? console.error;
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
  const app = createApp({
    version: "0.0.0",
    staticDir: resolve(packageRoot, "dist/web"),
    dev: env.PAWNPAL_DEV === "1",
    coi: env.PAWNPAL_NO_COI !== "1",
  });
  const preferredPort = args.port ?? 4747;
  const port =
    preferredPort === 0
      ? 0
      : await findPort({
          preferred: preferredPort,
          tryListen: dependencies.tryListen,
        });
  const server = await (dependencies.serveApp ?? serveApp)(app, port);
  const url = `http://127.0.0.1:${server.port}`;
  log(`pawnpal is running at ${url}`);
  log("Press Ctrl+C to stop");
  if (args.open) await (dependencies.openBrowser ?? openBrowser)(url);

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
