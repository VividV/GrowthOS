import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globalSetup: ["./global-setup.mjs"],
    include: ["**/*.test.mjs"],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
