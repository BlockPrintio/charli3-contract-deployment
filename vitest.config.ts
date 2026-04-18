import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 120_000,
    include:
      process.env.INTEGRATION === "true"
        ? ["test/integration/**/*.test.ts"]
        : ["test/unit/**/*.test.ts"],
  },
});
