import { defineConfig } from "@playwright/test";
import arcade from "./playwright.arcade.config";

// Optional Safari-engine compatibility pass; never part of the metered default CI.
export default defineConfig({
  ...arcade,
  reporter: [["list"], ["json", { outputFile: "test-results/arcade-webkit-summary.json" }]],
  outputDir: "test-results/arcade-webkit",
  use: { ...arcade.use, browserName: "webkit", channel: undefined },
  projects: [{
    name: "arcade-webkit",
    testMatch: /on-demand\/ronins-run-3d\.spec\.ts/,
  }],
});
