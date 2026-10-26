import { defineConfig, devices } from "@playwright/test";

/**
 * Two deliberately separate suites:
 *  - smoke: READ-ONLY checks that are safe against production (public pages,
 *    redirects, manifest, bundle secret scan, cron auth). No sign-in, no form
 *    submission, no writes. Target with SMOKE_BASE_URL.
 *  - e2e:   signed-in, state-changing flows. Only against an isolated test
 *    deployment (E2E_BASE_URL + E2E_ISOLATED=1); skipped otherwise.
 */
const smokeBase = process.env.SMOKE_BASE_URL ?? "https://sac-scan-track.vercel.app";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/playwright-html", open: "never" }],
    ["junit", { outputFile: "test-results/playwright-junit.xml" }],
  ],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  outputDir: "test-results/playwright-artifacts",
  projects: [
    {
      name: "smoke-desktop",
      testMatch: /smoke\..*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: smokeBase },
    },
    {
      name: "smoke-mobile",
      testMatch: /smoke\.layout\.spec\.ts/,
      use: { ...devices["Pixel 7"], baseURL: smokeBase },
    },
  ],
});
