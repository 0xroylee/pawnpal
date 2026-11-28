import { constants } from "node:fs";
import { access, open, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, dirname, isAbsolute, resolve, sep } from "node:path";
import {
  createEngineClient,
  type EngineClient,
} from "../../src/web/engine/EngineClient.js";
import { NodeStockfishTransport } from "../../src/web/engine/nodeTransport.js";
import type { EngineTransport } from "../../src/web/engine/transport.js";
import { UciProcessTransport } from "./uciProcessTransport.ts";

export type TrainingEngineSpec = "wasm" | { uci: string };

export type EngineInputs = {
  files: string[];
  directories: string[];
  values: {
    kind: "wasm" | "uci";
    command: string | null;
    executableKind: "binary" | "script";
    uciBanner: string[];
    operatorIdentity: string | null;
  };
};

type NamedEngineTransport = EngineTransport & {
  readonly name: string;
  readonly uciBanner: string[];
};

class NameCapturingTransport implements NamedEngineTransport {
  private currentName: string;
  private readonly bannerLines: string[] = [];
  private capturingBanner = false;
  private bannerCaptured = false;

  constructor(
    private readonly transport: EngineTransport,
    fallbackName: string,
  ) {
    this.currentName = fallbackName;
  }

  get name(): string {
    return this.currentName;
  }

  get uciBanner(): string[] {
    return [...this.bannerLines];
  }

  send(line: string): void {
    this.transport.send(line);
  }

  onLine(callback: (line: string) => void): () => void {
    return this.transport.onLine((line) => {
      if (!this.bannerCaptured) {
        if (!this.capturingBanner && line.startsWith("id ")) {
          this.capturingBanner = true;
        }
        if (this.capturingBanner && line !== "uciok") {
          this.bannerLines.push(line);
        }
        if (this.capturingBanner && line === "uciok") {
          this.capturingBanner = false;
          this.bannerCaptured = true;
        }
      }
      if (line.startsWith("id name ")) {
        const name = line.slice("id name ".length).trim();
        if (name) this.currentName = name;
      }
      callback(line);
    });
  }

  terminate(): void {
    this.transport.terminate();
  }
}

export function createTrainingEngine({
  engine,
  assets = [],
  identity,
}: {
  engine: TrainingEngineSpec;
  assets?: string[];
  identity?: string;
}): {
  client: EngineClient;
  readonly name: string;
  readonly failureCause?: string;
  describeInputs(): Promise<EngineInputs>;
} {
  let failureCause: string | undefined;
  let initialized = false;
  const clientRef: { current?: EngineClient } = {};
  const baseTransport =
    engine === "wasm"
      ? new NodeStockfishTransport()
      : new UciProcessTransport(engine.uci, [], (cause) => {
          failureCause = cause;
          clientRef.current?.terminate();
        });
  const fallbackName = engine === "wasm" ? "Stockfish lite-single" : engine.uci;
  const transport = new NameCapturingTransport(baseTransport, fallbackName);
  const client = createEngineClient(transport);
  const initialize = client.init.bind(client);
  client.init = async () => {
    await initialize();
    initialized = true;
  };
  clientRef.current = client;

  return {
    client,
    get failureCause() {
      return failureCause;
    },
    get name() {
      return transport.name;
    },
    async describeInputs() {
      if (!initialized) {
        throw new Error("Engine inputs are not known before init()");
      }
      return resolveEngineInputs(engine, assets, identity, transport.uciBanner);
    },
  };
}

async function resolveEngineInputs(
  engine: TrainingEngineSpec,
  assets: string[],
  identity: string | undefined,
  uciBanner: string[],
): Promise<EngineInputs> {
  switch (engine) {
    case "wasm": {
      const runtimeFiles = resolveWasmEngineFiles();
      const extraAssets = await resolveAssets(assets);
      return {
        files: unique([...runtimeFiles, ...extraAssets.files]),
        directories: extraAssets.directories,
        values: {
          kind: "wasm",
          command: null,
          executableKind: "binary",
          uciBanner: [...uciBanner],
          operatorIdentity: identity ?? null,
        },
      };
    }
    default: {
      if (isUciEngine(engine)) {
        return resolveUciInputs(engine, assets, identity, uciBanner);
      }
      const exhaustiveEngine: never = engine;
      return exhaustiveEngine;
    }
  }
}

function isUciEngine(
  engine: TrainingEngineSpec,
): engine is Extract<TrainingEngineSpec, { uci: string }> {
  return (
    typeof engine === "object" &&
    engine !== null &&
    typeof engine.uci === "string"
  );
}

async function resolveUciInputs(
  engine: { uci: string },
  assets: string[],
  identity: string | undefined,
  uciBanner: string[],
): Promise<EngineInputs> {
  const command = await resolveCommand(engine.uci);
  const assetPaths = await resolveAssets(assets);
  const executableKind = await classifyExecutable(command);
  if (
    executableKind === "script" &&
    assets.length === 0 &&
    identity === undefined
  ) {
    throw new Error(
      `Engine ${command} is a script; its real inputs (interpreter, imports, wrapped binary, nets) cannot be fingerprinted. Pass --engine-assets <path,...> and/or --engine-identity <label>.`,
    );
  }

  return {
    files: unique([command, ...assetPaths.files]),
    directories: assetPaths.directories,
    values: {
      kind: "uci",
      command,
      executableKind,
      uciBanner: [...uciBanner],
      operatorIdentity: identity ?? null,
    },
  };
}

/** @internal Exposed for the focused resolver test; the stage uses it through describeInputs(). */
export function resolveWasmEngineFiles(): string[] {
  const requireModule = createRequire(import.meta.url);
  const entryPath = requireModule.resolve("stockfish");
  const stockfish = requireModule(entryPath) as {
    findEngine?: (engineName: string) => string;
  };
  if (!stockfish.findEngine) {
    throw new Error("The stockfish package does not expose findEngine().");
  }
  const enginePath = stockfish.findEngine("lite-single");
  return [
    entryPath,
    enginePath,
    enginePath.replace(/\.js$/i, ".wasm"),
    resolve(dirname(entryPath), "package.json"),
  ];
}

async function resolveCommand(command: string): Promise<string> {
  if (isAbsolute(command) || command.includes(sep) || command.includes("/")) {
    return resolve(command);
  }

  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = resolve(directory, command);
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue in PATH order, matching spawn's executable lookup.
    }
  }

  throw new Error(
    `Engine command ${JSON.stringify(command)} was not found on PATH.`,
  );
}

async function resolveAssets(
  assets: string[],
): Promise<{ files: string[]; directories: string[] }> {
  const files: string[] = [];
  const directories: string[] = [];
  for (const asset of assets) {
    const path = resolve(asset);
    const details = await stat(path);
    if (details.isDirectory()) directories.push(path);
    else if (details.isFile()) files.push(path);
    else
      throw new Error(
        `Engine asset is not a regular file or directory: ${path}`,
      );
  }
  return { files: unique(files), directories: unique(directories) };
}

async function classifyExecutable(path: string): Promise<"binary" | "script"> {
  const file = await open(path, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const binarySignatures = [
      Buffer.from("7f454c46", "hex"),
      Buffer.from("cffaedfe", "hex"),
      Buffer.from("cafebabe", "hex"),
      Buffer.from("4d5a", "hex"),
    ];
    return binarySignatures.some((signature) =>
      bytes.subarray(0, signature.length).equals(signature),
    )
      ? "binary"
      : "script";
  } finally {
    await file.close();
  }
}

function unique(paths: string[]): string[] {
  return [...new Set(paths)];
}
