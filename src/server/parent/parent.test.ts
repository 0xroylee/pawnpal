import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { finalizeFact } from "../../shared/coach/types.ts";
import { createApp } from "../app.ts";
import { openLibrary } from "../db/library.ts";
import { suggestModel } from "../llm/brain.ts";
import { mockOpenAi } from "../llm/mockOpenAi.ts";
import { parentPinKey } from "./gate.ts";

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

function setup(
  dependencies: NonNullable<
    Parameters<typeof createApp>[0]["apiDependencies"]
  > = {},
) {
  const home = mkdtempSync(join(tmpdir(), "pawnpal-parent-"));
  const library = openLibrary({ home });
  cleanup.push(() => {
    library.close();
    rmSync(home, { recursive: true, force: true });
  });
  const app = createApp({
    staticDir: resolve("tests/fixtures/site"),
    dev: false,
    version: "test",
    library,
    apiDependencies: dependencies,
  });
  const api = (path: string, method = "GET", data?: unknown, cookie?: string) =>
    app.request(`/api/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  return { api, library };
}

const pin = "1234";
const createPin = { pin, confirm: pin };

it("hashes the PIN, protects every adult action, and keeps kid preferences available", async () => {
  const { api, library } = setup();
  expect(await (await api("parent/status")).json()).toMatchObject({
    setup: true,
    pinSet: false,
    unlocked: false,
  });
  expect(
    (await api("parent/pin", "POST", { ...createPin, confirm: "3412" })).status,
  ).toBe(400);
  const session = await api("parent/pin", "POST", createPin);
  const header = session.headers.get("set-cookie")!;
  expect(header).toContain("HttpOnly");
  expect(header).toContain("SameSite=Strict");
  const cookie = header.split(";")[0]!;
  expect(library.getSetting(parentPinKey)).toMatch(
    /^[a-f0-9]{32}:[a-f0-9]{64}$/,
  );
  const newProfile = { name: "Mina", avatar: "fox" };
  expect((await api("profiles", "POST", newProfile)).status).toBe(401);
  const profile = await (
    await api("profiles", "POST", newProfile, cookie)
  ).json();
  const id = profile.id;
  const guarded = [
    ["POST", "parent/pin"],
    ["PATCH", `profiles/${id}`],
    ["DELETE", `profiles/${id}`],
    ["GET", `profiles/${id}/export`],
    ["GET", "parent/settings/data"],
    ["POST", "parent/settings/reset"],
    ["POST", "parent/settings/finish-setup"],
    ["GET", "parent/settings/coach"],
    ["PUT", "parent/settings/coach"],
    ["POST", "parent/settings/coach/models"],
    ["POST", "parent/settings/coach/test"],
    ["GET", "parent/settings/network"],
    ["PUT", "parent/settings/network"],
  ];
  for (const [method, path] of guarded)
    expect((await api(path!, method)).status, `${method} ${path}`).toBe(401);
  expect((await api("profiles")).status).toBe(200);
  expect(
    (
      await api(`profiles/${id}/preferences`, "PATCH", {
        soundOn: false,
        level: 3,
      })
    ).status,
  ).toBe(400);
  expect(
    await (
      await api(`profiles/${id}/preferences`, "PATCH", { soundOn: false })
    ).json(),
  ).toMatchObject({ soundOn: false });
  expect(
    (await api(`profiles/${id}`, "PATCH", { name: "Max" }, cookie)).status,
  ).toBe(200);
  const firstHash = library.getSetting(parentPinKey);
  const reissued = await api("parent/pin", "POST", createPin, cookie);
  expect(reissued.status).toBe(200);
  expect(library.getSetting(parentPinKey)).not.toBe(firstHash);
  expect(
    (await api("parent/settings/data", "GET", undefined, cookie)).status,
  ).toBe(401);
});

it("waits one minute after five bad attempts and expires sessions after fifteen minutes idle", async () => {
  let now = 0;
  const { api, library } = setup({ now: () => now });
  await api("parent/pin", "POST", createPin);
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await api("parent/unlock", "POST", { pin: "9999" })).status).toBe(
      attempt < 4 ? 401 : 429,
    );
  expect((await api("parent/unlock", "POST", { pin })).status).toBe(429);
  now += 60_000;
  const unlocked = await api("parent/unlock", "POST", { pin });
  const cookie = unlocked.headers.get("set-cookie")!.split(";")[0]!;
  now += 14 * 60_000;
  expect(
    (await api("parent/settings/data", "GET", undefined, cookie)).status,
  ).toBe(200);
  now += 14 * 60_000;
  expect(
    (await api("parent/settings/data", "GET", undefined, cookie)).status,
  ).toBe(200);
  now += 15 * 60_000;
  expect(
    (await api("parent/settings/data", "GET", undefined, cookie)).status,
  ).toBe(401);
  library.clearSetting(parentPinKey);
  expect(await (await api("parent/status")).json()).toMatchObject({
    pinSet: false,
    unlocked: false,
  });
});

it("detects Ollama, lists models and tests rewording without exposing the key", async () => {
  const mock = mockOpenAi({
    models: ["qwen3:1.7b-q4_K_M", "qwen3:14b"],
    replies: [{ text: "Move your knight somewhere safe." }],
  });
  let ollamaAvailable = true;
  const { api } = setup({
    fetch: async (input, opts) => {
      if (String(input).endsWith("/api/version"))
        return new Response(null, { status: ollamaAvailable ? 200 : 404 });
      return mock.app.request(String(input), opts);
    },
  });
  const cookie = (await api("parent/pin", "POST", createPin)).headers
    .get("set-cookie")!
    .split(";")[0]!;
  const settings = {
    enabled: true,
    model: "qwen3:1.7b-q4_K_M",
    apiKey: "private-test-key",
  };
  expect(
    await (
      await api("parent/settings/coach/models", "POST", settings, cookie)
    ).json(),
  ).toMatchObject({
    connected: true,
    models: ["qwen3:1.7b-q4_K_M", "qwen3:14b"],
    suggested: suggestModel(),
  });
  expect(
    await (
      await api("parent/settings/coach/test", "POST", settings, cookie)
    ).json(),
  ).toMatchObject({
    source: "llm",
    text: "Move your knight somewhere safe.",
    elapsedMs: expect.any(Number),
  });
  expect(
    JSON.parse(mock.requests.find(({ method }) => method === "POST")!.body),
  ).toMatchObject({ reasoning_effort: "none" });
  expect(
    (await api("parent/settings/coach", "PUT", settings, cookie)).status,
  ).toBe(200);
  const saved = await (
    await api("parent/settings/coach", "GET", undefined, cookie)
  ).json();
  expect(saved.hasApiKey).toBe(true);
  expect(saved.apiKey).toBeUndefined();
  ollamaAvailable = false;
  expect(
    await (
      await api("parent/settings/coach/models", "POST", settings, cookie)
    ).json(),
  ).toMatchObject({
    connected: false,
    models: [],
  });
  for (const ram of [8, 12, 24, 40])
    expect(suggestModel(ram * 1024 ** 3)).toBe("qwen3:1.7b-q4_K_M");
});

it("makes no disabled requests, rejects unknown squares and pauses after three failures", async () => {
  const mock = mockOpenAi({
    replies: [
      { text: "Your knight needs a new spot." },
      { text: "Move your knight to h7." },
      { delayMs: 125 },
      { status: 500 },
      { status: 500 },
    ],
  });
  const { api, library } = setup({
    fetch: (input, opts) => mock.app.request(String(input), opts),
  });
  const phrase = () =>
    api("coach/rephrase", "POST", {
      templateText: "Your knight needs a safer spot.",
      mode: "explain",
      kidColor: "w",
      kidAge: 8,
      language: "en",
      profileName: "Private Name",
      fact: finalizeFact({
        kind: "hanging-piece",
        subject: { type: "n", color: "w", square: "f3" },
      }),
    }).then((response) => response.json());
  expect(await phrase()).toMatchObject({ source: "template" });
  expect(mock.requests).toHaveLength(0);
  library.setSetting(
    "llm",
    JSON.stringify({ model: "mock-model", timeoutMs: 50, enabled: true }),
  );
  expect(await phrase()).toMatchObject({ source: "llm" });
  expect(await phrase()).toMatchObject({
    source: "template",
    reason: "unknown-square",
  });
  expect(await phrase()).toMatchObject({ reason: "timeout" });
  expect(await phrase()).toMatchObject({ reason: "http" });
  expect(await phrase()).toMatchObject({ reason: "http" });
  expect(await phrase()).toMatchObject({ source: "template" });
  expect(mock.requests).toHaveLength(5);
  expect(
    mock.requests.every(({ body }) => !body.includes("Private Name")),
  ).toBe(true);
  expect(await (await api("coach/status")).json()).toMatchObject({
    paused: true,
  });
});
