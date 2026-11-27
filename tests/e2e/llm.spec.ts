import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { serve } from "@hono/node-server";
import { expect, test } from "@playwright/test";
import { createApp } from "../../src/server/app.ts";
import { openLibrary } from "../../src/server/db/library.ts";
import { suggestModel } from "../../src/server/llm/brain.ts";
import { mockOpenAi } from "../../src/server/llm/mockOpenAi.ts";
import { loadDetectorFixture, recordingFor } from "./replay.js";

test("connects a mock Ollama model, rewords a nudge, and falls back on an invalid reply", async ({
  page,
}) => {
  const suggested = suggestModel();
  const mock = mockOpenAi({
    models: [suggested, "other-model"],
    replies: [
      { text: "Move your knight somewhere safe." },
      { text: "Take another look." },
      { text: "Look at h7." },
    ],
  });
  const home = await mkdtemp(join(tmpdir(), "pawnpal-coach-e2e-"));
  const library = openLibrary({ home });
  const app = createApp({
    dev: true,
    version: "test",
    staticDir: resolve("dist/web"),
    library,
    apiDependencies: {
      fetch: (input, init) =>
        String(input).endsWith("/api/version")
          ? Promise.resolve(new Response(null, { status: 200 }))
          : mock.app.request(String(input), init),
    },
  });
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  try {
    if (!server.listening) await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Coach test server has no HTTP port");
    const root = `http://127.0.0.1:${address.port}`;
    await page.goto(root);
    await page.getByRole("button", { name: "Set up pawnpal" }).click();
    await page.getByLabel("Four-digit PIN").fill("8427");
    await page.getByLabel("Confirm PIN").fill("8427");
    await page.getByRole("button", { name: "Save PIN" }).click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Private kid name");
    await page.getByRole("button", { name: "Create profile" }).click();
    const model = page.getByRole("combobox", { name: "Model" });
    await expect(
      model.getByRole("option", { name: `${suggested} (suggested)` }),
    ).toBeAttached();
    await model.selectOption(suggested);
    await page.getByRole("button", { name: "Test", exact: true }).click();
    await expect(
      page.getByText("Move your knight somewhere safe."),
    ).toBeVisible();
    await expect(page.getByText(/^Model reply · .* seconds$/)).toBeVisible();
    await page.getByRole("button", { name: "Use this model" }).click();
    await expect(
      page.getByRole("button", { name: "Private kid name" }),
    ).toBeVisible();

    const fixture = loadDetectorFixture("missed-fork-1");
    await page.addInitScript((recording) => {
      globalThis.__pawnpalReplay = recording;
    }, recordingFor(fixture));
    await page.goto(
      `${root}/?${new URLSearchParams({ fen: fixture.fen, analyst: "replay" })}`,
    );
    await page.locator('[data-square="a2"]').click();
    await page.locator('[data-square="a3"]').click();
    const bubble = page.locator(".pp-bubble__text");
    await expect(bubble).toHaveAttribute("data-source", "llm");
    await expect(bubble).toHaveText("Take another look.");
    await page.getByRole("button", { name: "Keep my move" }).click();
    await expect(bubble).toHaveAttribute("data-source", "template");
    await expect(bubble).toHaveAttribute("data-reason", "unknown-square");
    expect(
      mock.requests.every(({ body }) => !body.includes("Private kid name")),
    ).toBe(true);
  } finally {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      // The page is still open and may hold a preconnected socket, which
      // close() would wait for until the test times out.
      if ("closeAllConnections" in server) server.closeAllConnections();
    });
    library.close();
    await rm(home, { recursive: true, force: true });
  }
});
