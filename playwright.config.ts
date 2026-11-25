import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const localChannel = process.env.CI ? undefined : "chrome";
const testHome =
  process.env.PAWNPAL_E2E_HOME ?? mkdtempSync(join(tmpdir(), "pawnpal-e2e-"));
if (!process.env.PAWNPAL_E2E_HOME) {
  process.env.PAWNPAL_E2E_HOME = testHome;
  process.once("exit", () =>
    rmSync(testHome, { recursive: true, force: true }),
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "default",
      testIgnore: ["**/coi-fallback.spec.ts", "**/tablet.spec.ts"],
      use: {
        channel: localChannel,
        baseURL: "http://127.0.0.1:4799",
      },
    },
    {
      name: "no-coi",
      testMatch: "**/coi-fallback.spec.ts",
      use: {
        channel: localChannel,
        baseURL: "http://127.0.0.1:4798",
      },
    },
    ...(process.env.PAWNPAL_E2E_WEBKIT === "1"
      ? [
          {
            name: "tablet",
            testMatch: "**/tablet.spec.ts",
            use: {
              ...devices["iPad Mini"],
              browserName: "webkit" as const,
              channel: undefined,
              reducedMotion: "reduce" as const,
              baseURL: "http://127.0.0.1:4798",
            },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: "node bin/pawnpal.js --no-open --port 4799",
      url: "http://127.0.0.1:4799/api/health",
      env: {
        PAWNPAL_DEV: "1",
        PAWNPAL_HOME: join(testHome, "default"),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node bin/pawnpal.js --no-open --port 4798",
      url: "http://127.0.0.1:4798/api/health",
      env: {
        PAWNPAL_NO_COI: "1",
        PAWNPAL_HOME: join(testHome, "no-coi"),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
