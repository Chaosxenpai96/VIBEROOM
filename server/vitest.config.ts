import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://viberoom:viberoom@localhost:5432/viberoom_test",
      DISABLE_RATE_LIMIT: "1",
      HOST_GRACE_MS: "400",
      NODE_ENV: "test",
    },
  },
});
