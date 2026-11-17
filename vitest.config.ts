import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    environment: "node",
  },
});
