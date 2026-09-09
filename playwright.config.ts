import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL:
      process.env.APP_ORIGIN ??
      `http://localhost:${process.env.WEB_PORT ?? "8080"}`,
    headless: true,
  },
});
