import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const staticDir = resolve("tests/fixtures/site");

describe("createApp", () => {
  it("returns health metadata and isolation headers", async () => {
    const response = await createApp({
      version: "1.2.3",
      staticDir,
      dev: true,
    }).request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      version: "1.2.3",
      dev: true,
    });
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin",
    );
    expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBe(
      "require-corp",
    );
  });

  it("applies isolation headers to static and unknown API responses", async () => {
    const app = createApp({ version: "1", staticDir, dev: false });
    const staticResponse = await app.request("/");
    const apiResponse = await app.request("/api/missing");

    expect(staticResponse.headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin",
    );
    expect(apiResponse.status).toBe(404);
    expect(apiResponse.headers.get("Cross-Origin-Embedder-Policy")).toBe(
      "require-corp",
    );
    expect(await apiResponse.json()).toEqual({ error: "Not found" });
  });

  it("can disable isolation headers and serves the SPA fallback", async () => {
    const app = createApp({ version: "1", staticDir, dev: false, coi: false });
    const response = await app.request("/nested/client/route");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Pawnpal fixture");
    expect(response.headers.get("Cross-Origin-Opener-Policy")).toBeNull();
    expect(response.headers.get("Cross-Origin-Embedder-Policy")).toBeNull();
  });

  it("serves WebAssembly with the correct content type", async () => {
    const response = await createApp({
      version: "1",
      staticDir,
      dev: false,
    }).request("/tiny.wasm");
    expect(response.headers.get("content-type")).toContain("application/wasm");
  });
});
