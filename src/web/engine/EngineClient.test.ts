import { describe, expect, it, vi } from "vitest";
import {
  EngineClient,
  EngineError,
  createEngineClient,
} from "./EngineClient.js";
import { FakeTransport } from "./transport.js";

describe("EngineClient", () => {
  it("completes the UCI handshake and configures Threads", async () => {
    const transport = new FakeTransport();
    const client = createEngineClient(transport, { hardwareConcurrency: 8 });

    await client.init();

    expect(transport.sent).toEqual([
      "uci",
      "setoption name Threads value 7",
      "isready",
    ]);
  });

  it("collects the latest line for each MultiPV and converts SAN", async () => {
    const transport = new FakeTransport((command) => {
      if (command === "go depth 8") {
        return [
          "info depth 7 multipv 1 score cp 10 pv e2e4 e7e5",
          "info depth 8 multipv 1 score cp 24 pv d2d4 d7d5",
          "info depth 8 multipv 2 score mate 3 pv g1f3 d7d5",
          "info depth 8 multipv 3 score cp -15 pv c2c4 e7e5",
          "bestmove d2d4",
        ];
      }
      return undefined;
    });
    const client = createEngineClient(transport, { hardwareConcurrency: 2 });
    await client.init();

    const lines = await client.analyze(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      { depth: 8, multiPv: 3 },
    );

    expect(lines).toEqual([
      { uci: "d2d4", san: "d4", cp: 24, pv: ["d2d4", "d7d5"], depth: 8 },
      { uci: "g1f3", san: "Nf3", mate: 3, pv: ["g1f3", "d7d5"], depth: 8 },
      { uci: "c2c4", san: "c4", cp: -15, pv: ["c2c4", "e7e5"], depth: 8 },
    ]);
  });

  it("returns Stockfish's selected bestmove instead of the first PV move", async () => {
    const transport = new FakeTransport((command) =>
      command.startsWith("go ")
        ? ["info depth 4 score cp 12 pv e2e4", "bestmove d2d4"]
        : undefined,
    );
    const client = createEngineClient(transport);
    await client.init();
    await expect(
      client.bestMove(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        { depth: 4 },
      ),
    ).resolves.toBe("d2d4");
  });

  it("returns bestmove when no qualifying info line precedes it", async () => {
    const transport = new FakeTransport((command) =>
      command.startsWith("go ") ? ["bestmove d2d4"] : undefined,
    );
    const client = createEngineClient(transport);
    await client.init();

    await expect(
      client.bestMove(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        { depth: 4 },
      ),
    ).resolves.toBe("d2d4");
  });

  it("reports no-move positions", async () => {
    const noMoveTransport = new FakeTransport((command) =>
      command.startsWith("go ") ? ["bestmove (none)"] : undefined,
    );
    const noMoveClient = createEngineClient(noMoveTransport);
    await noMoveClient.init();
    await expect(
      noMoveClient.bestMove(
        "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
        { depth: 1 },
      ),
    ).rejects.toMatchObject({
      code: "no-move",
    });
  });

  it("stops and drains an active search before starting its replacement", async () => {
    const transport = new FakeTransport((command) => {
      if (command === "go depth 3") return ["info depth 2 score cp 5 pv e2e4"];
      if (command === "stop") return ["bestmove e2e4"];
      if (command === "go depth 5")
        return ["info depth 5 score cp 15 pv d2d4", "bestmove d2d4"];
      return undefined;
    });
    const client = createEngineClient(transport);
    await client.init();

    const first = client.analyze("position-one", { depth: 3 });
    await vi.waitFor(() => expect(transport.sent).toContain("go depth 3"));
    const second = client.analyze("position-two", { depth: 5 });
    await expect(first).resolves.toMatchObject([{ uci: "e2e4" }]);
    await expect(second).resolves.toMatchObject([{ uci: "d2d4" }]);

    const stopIndex = transport.sent.indexOf("stop");
    const secondPositionIndex = transport.sent.indexOf(
      "position fen position-two",
    );
    expect(stopIndex).toBeGreaterThan(0);
    expect(secondPositionIndex).toBeGreaterThan(stopIndex);
  });

  it("drains a timed-out search before accepting a replacement search", async () => {
    const transport = new FakeTransport((command) => {
      if (command === "stop" || command.startsWith("go ")) return [];
      return undefined;
    });
    const client = createEngineClient(transport, { timeoutMs: 300 });
    await client.init();

    const first = client.bestMove(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      { depth: 3 },
    );
    const firstTimeout = expect(first).rejects.toMatchObject({
      code: "timeout",
    });
    await vi.waitFor(() => expect(transport.sent).toContain("go depth 3"));
    await firstTimeout;
    expect(transport.sent).toContain("stop");

    const second = client.bestMove(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      { depth: 5 },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(transport.sent).not.toContain(
      "position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
    );

    transport.emit("bestmove e2e4");
    await vi.waitFor(() => expect(transport.sent).toContain("go depth 5"));
    transport.emit("info depth 5 score cp 15 pv e7e5");
    transport.emit("bestmove e7e5");

    await expect(second).resolves.toBe("e7e5");
  });

  it("requires init before game and option commands", async () => {
    const client = new EngineClient(new FakeTransport());
    await expect(client.newGame()).rejects.toBeInstanceOf(EngineError);
    await expect(client.newGame()).rejects.toMatchObject({
      code: "not-initialized",
    });
  });
});
