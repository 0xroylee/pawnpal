import { defineConfig, devices } from "@playwright/test";

const localChannel = process.env.CI ? undefined : "chrome";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    channel: localChannel,
  },
  projects: [
    {
      name: "default",
      testIgnore: "**/coi-fallback.spec.ts",
      use: {
        baseURL: "http://127.0.0.1:4799",
      },
    },
    {
      name: "no-coi",
      testMatch: "**/coi-fallback.spec.ts",
      use: {
        baseURL: "http://127.0.0.1:4798",
      },
    },
  ],
  webServer: [
    {
      command: "node bin/pawnpal.js --no-open --port 4799",
      url: "http://127.0.0.1:4799/api/health",
      env: {
        PAWNPAL_DEV: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node bin/pawnpal.js --no-open --port 4798",
      url: "http://127.0.0.1:4798/api/health",
      env: {
        PAWNPAL_DEV: "1",
        PAWNPAL_NO_COI: "1",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
