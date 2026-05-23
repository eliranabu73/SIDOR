/**
 * Playwright configuration for sidor4S frontend E2E tests.
 *
 * Base URL:   http://localhost:3001  (Next.js dev server port)
 * Locale:     he-IL  (RTL, Hebrew)
 * Browser:    Chromium (headless)
 *
 * Run:
 *   cd web && npm run test:e2e
 * Or with UI:
 *   cd web && npx playwright test --ui
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  /* Run tests in parallel within a file; serial across files to avoid port collisions */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only */
  forbidOnly: !!process.env["CI"],
  /* Retry failing tests once on CI */
  retries: process.env["CI"] ? 1 : 0,
  workers: 1,
  reporter: "list",

  use: {
    /* All requests go to the local Next.js dev server */
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3001",
    /* RTL Hebrew locale */
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
    /* Screenshots only on failure */
    screenshot: "only-on-failure",
    /* Trace only on first retry */
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /*
   * webServer block is commented out intentionally:
   *   - when the dev server is already running (typical local workflow) we skip
   *     the extra boot cost;
   *   - uncomment and adjust if you want Playwright to start/stop the server.
   *
   * webServer: {
   *   command: "npm run dev",
   *   url: "http://localhost:3001",
   *   reuseExistingServer: true,
   * },
   */
});
