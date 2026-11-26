import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";
import { createEngineClient } from "../../src/web/engine/EngineClient.js";
import { UciProcessTransport } from "./uciProcessTransport.ts";

const fakeUciPath = fileURLToPath(
  new URL("../test/fake-uci.mjs", import.meta.url),
);
const subprocessTestsEnabled = process.env.PAWNPAL_NO_SUBPROCESS !== "1";

if (!subprocessTestsEnabled) {
  console.info("Skipping UCI subprocess tests because PAWNPAL_NO_SUBPROCESS=1");
}

describe.skipIf(!subprocessTestsEnabled)("UciProcessTransport", () => {
  it("runs EngineClient MultiPV analysis against the fake UCI process", async () => {
    const transport = new UciProcessTransport(process.execPath, [fakeUciPath]);
    const client = createEngineClient(transport, {
      threads: 1,
      timeoutMs: 2_000,
    });
    const chess = new Chess();
    const legalMoves = new Set(
      chess
        .moves({ verbose: true })
        .map((move) => `${move.from}${move.to}${move.promotion ?? ""}`),
    );

    try {
      await client.init();
      await client.newGame();
      const lines = await client.analyze(chess.fen(), {
        depth: 1,
        multiPv: 3,
      });

      expect(lines).toHaveLength(3);
      expect(lines.every((line) => legalMoves.has(line.uci))).toBe(true);
      expect(lines.map((line) => line.depth)).toEqual([1, 1, 1]);
    } finally {
      client.terminate();
    }
  });

  it("trims stdout lines, drops empty lines, and rejects sends after exit", async () => {
    const transport = new UciProcessTransport(process.execPath, [
      "-e",
      "process.stdout.write(' first \\n\\n second \\n')",
    ]);
    const lines: string[] = [];

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("timed out waiting for output")),
          2_000,
        );
        const unsubscribe = transport.onLine((line) => {
          lines.push(line);
          if (lines.length === 2) {
            clearTimeout(timer);
            unsubscribe();
            resolve();
          }
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(lines).toEqual(["first", "second"]);
      expect(() => transport.send("uci")).toThrow("Engine transport is closed");
    } finally {
      transport.terminate();
    }
  });

  it("closes after spawn failure", async () => {
    const transport = new UciProcessTransport("pawnpal-no-such-engine-im18");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(() => transport.send("uci")).toThrow("Engine transport is closed");
  });

  it("notifies the client of an unexpected exit with stderr before timeout", async () => {
    const failures: string[] = [];
    const clientRef: { current?: ReturnType<typeof createEngineClient> } = {};
    const transport = new UciProcessTransport(
      process.execPath,
      [
        "-e",
        "process.stderr.write('first diagnostic\\nlast diagnostic\\n'); setTimeout(() => process.exit(42), 20)",
      ],
      (failure: string) => {
        failures.push(failure);
        clientRef.current?.terminate();
      },
    );
    const client = createEngineClient(transport, { timeoutMs: 1_000 });
    clientRef.current = client;

    await expect(client.init()).rejects.toMatchObject({
      code: "transport-closed",
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("exit code 42");
    expect(failures[0]).toContain("last diagnostic");
  });

  it("reports spawn failures through the failure callback", async () => {
    const failures: string[] = [];
    const clientRef: { current?: ReturnType<typeof createEngineClient> } = {};
    const transport = new UciProcessTransport(
      "pawnpal-no-such-engine-spawn-callback",
      [],
      (failure: string) => {
        failures.push(failure);
        clientRef.current?.terminate();
      },
    );
    const client = createEngineClient(transport, { timeoutMs: 1_000 });
    clientRef.current = client;

    await expect(client.init()).rejects.toMatchObject({
      code: "transport-closed",
    });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("spawn error");
  });
});
