import { defineConfig, devices } from "@playwright/test";
import baseConfig from "./playwright.config";

// Explicit local run; the metered default CI suite remains unchanged.
export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/arcade-summary.json" }]],
  outputDir: "test-results/arcade",
  webServer: {
    ...baseConfig.webServer,
    command: "HAKKEN_ARCADE_CHECK=1 E2E_AUTH_ENABLED=1 NEXT_PUBLIC_E2E_AUTH_ENABLED=1 NEXT_PUBLIC_CONVEX_URL=${NEXT_PUBLIC_CONVEX_URL:-https://e2e-placeholder.convex.cloud} npm run dev -- -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  use: {
    ...baseConfig.use,
    ...devices["Desktop Chrome"],
    viewport: { width: 1360, height: 960 },
    channel: "chrome",
    headless: true,
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
  },
  projects: [{ name: "arcade", testMatch: /on-demand\/ronins-run-3d\.spec\.ts/ }],
});
