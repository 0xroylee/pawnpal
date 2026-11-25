import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { run } from "./cli.ts";
import { allowedHost, isPrivateClient, lanAddresses } from "./network.ts";

it("accepts only local and private clients and this machine's hosts on the listening port", async () => {
  for (const ip of [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "10.0.0.2",
    "172.31.0.2",
    "192.168.1.2",
    "169.254.1.2",
    "fc00::10",
    "fe80::2%en0",
  ])
    expect(isPrivateClient(ip), ip).toBe(true);
  for (const ip of [
    "1.1.1.1",
    "::ffff:0808:0808",
    "172.32.0.2",
    "198.51.100.8",
    "2001:db8::1",
    "0.0.0.0",
  ])
    expect(isPrivateClient(ip), ip).toBe(false);
  expect(allowedHost("localhost:4747", 4747, ["10.0.0.2"])).toBe(true);
  expect(allowedHost("10.0.0.2:4747", 4747, ["10.0.0.2"])).toBe(true);
  expect(allowedHost("10.0.0.3:4747", 4747, ["10.0.0.2"])).toBe(false);
  expect(allowedHost("localhost.evil.test:4747", 4747, [])).toBe(false);
  expect(allowedHost("localhost:1234", 4747, [])).toBe(false);
  expect(
    lanAddresses({
      en0: [
        {
          address: "10.0.0.2",
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: "10.0.0.2/24",
        },
      ],
    }),
  ).toEqual(["10.0.0.2"]);

  const app = createApp({
    dev: false,
    staticDir: resolve("tests/fixtures/site"),
    version: "test",
    apiDependencies: {
      network: {
        current: () => ({
          enabled: true,
          port: 4747,
          failed: false,
          changing: false,
        }),
        set() {},
      },
    },
  });
  const socket = (remoteAddress: string) => ({
    incoming: { socket: { remoteAddress } },
  });
  expect(
    (
      await app.request(
        "/api/health",
        { headers: { Host: "localhost:4747" } },
        socket("8.8.8.8"),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request(
        "/api/health",
        { headers: { Host: "foreign.test:4747" } },
        socket("192.168.0.10"),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request(
        "/api/health",
        { headers: { Host: "localhost:4747" } },
        socket("127.0.0.1"),
      )
    ).status,
  ).toBe(200);
});

it("rebinds on the same port and requires a separate authenticated browser", async () => {
  const home = mkdtempSync(join(tmpdir(), "pawnpal-network-"));
  const server = await run(["--port", "0", "--no-open"], {
    env: { PAWNPAL_HOME: home },
    log() {},
    installSignals: false,
  });
  try {
    const request = (path: string, init?: RequestInit) =>
      fetch(`http://127.0.0.1:${server!.port}/api/${path}`, init);
    const pin = await request("parent/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "0427", confirm: "0427" }),
    });
    const cookie = pin.headers.get("set-cookie")!.split(";")[0]!;
    const network = "parent/settings/network";
    const headers = { Cookie: cookie, "Content-Type": "application/json" };
    expect((await request(network)).status).toBe(401);
    for (const enabled of [true, false]) {
      expect(
        (
          await request(network, {
            method: "PUT",
            headers,
            body: JSON.stringify({ enabled }),
          })
        ).status,
      ).toBe(200);
      await vi.waitFor(
        async () => {
          const status = await request(network, { headers });
          expect(await status.json()).toMatchObject({
            enabled,
            changing: false,
            failed: false,
          });
        },
        { interval: 40 },
      );
      expect((await request(network)).status).toBe(401);
      expect(await (await request("network")).json()).toEqual({
        showBanner: enabled,
      });
    }
  } finally {
    await server?.close();
    rmSync(home, { recursive: true, force: true });
  }
});
