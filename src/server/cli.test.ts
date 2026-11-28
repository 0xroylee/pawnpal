import { describe, expect, it, vi } from "vitest";
import { checkNodeVersion, findPort, parseArgs, run } from "./cli.js";

describe("Node version support", () => {
  it.each([
    ["v20.11.0", false],
    ["v22.12.5", false],
    ["v22.13.0", true],
    ["v22.20.0", true],
    ["v23.0.0", true],
    ["v24.7.0", true],
    ["v26.1.0", true],
  ])("checks %s against Node 22.13", (version, ok) => {
    const result = checkNodeVersion(version);
    expect(result.ok).toBe(ok);
    if (!ok) expect(result.message).toContain("Node 22.13");
  });
});

describe("parseArgs", () => {
  it("uses the default port and opens the browser", () => {
    expect(parseArgs([])).toEqual({ port: 4747, open: true, help: false });
  });

  it("accepts port zero and no-open", () => {
    expect(parseArgs(["--no-open", "--port", "0"])).toEqual({
      port: 0,
      open: false,
      help: false,
    });
  });

  it("reports help without starting the server", () => {
    expect(parseArgs(["--help"])).toMatchObject({ help: true });
  });
});

describe("findPort", () => {
  it("moves to the next port when the preferred port is busy", async () => {
    const port = await findPort({
      preferred: 4747,
      tryListen: async (candidate) => candidate !== 4747,
    });
    expect(port).toBe(4748);
  });

  it("fails clearly when every candidate is busy", async () => {
    await expect(
      findPort({ preferred: 4747, attempts: 11, tryListen: async () => false }),
    ).rejects.toThrow("Could not find an open port from 4747 to 4757");
  });
});

describe("run", () => {
  it("prints the address and skips opening the browser with --no-open", async () => {
    const openBrowser = vi.fn();
    const log = vi.fn();
    const serveApp = vi.fn(() => ({ port: 4800, close: vi.fn() }));

    const home = mkdtempSync(join(tmpdir(), "pawnpal-cli-"));
    try {
      const server = await run(["--no-open", "--port", "0"], {
        serveApp,
        openBrowser,
        log,
        env: { PAWNPAL_HOME: home },
        installSignals: false,
      });
      await server?.close();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }

    expect(serveApp).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(
      "pawnpal is running at http://127.0.0.1:4800",
    );
    expect(openBrowser).not.toHaveBeenCalled();
  });

  // Browsers open spare connections before they send a request (preconnect).
  // server.close() waits for those, so Ctrl+C could leave pawnpal running.
  it("stops while a browser holds a connection with no request", async () => {
    const home = mkdtempSync(join(tmpdir(), "pawnpal-cli-"));
    let socket: Socket | undefined;
    try {
      const server = await run(["--no-open", "--port", "0"], {
        log: () => {},
        env: { PAWNPAL_HOME: home },
        installSignals: false,
      });
      if (!server) throw new Error("The server did not start");
      socket = connect(server.port, "127.0.0.1");
      await once(socket, "connect");
      // let the server accept it, as a real preconnect sits open for a while
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stopped = await Promise.race([
        Promise.resolve(server.close()).then(() => true),
        new Promise<false>((resolve) =>
          setTimeout(() => resolve(false), 3_000),
        ),
      ]);
      expect(stopped).toBe(true);
    } finally {
      socket?.destroy();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
