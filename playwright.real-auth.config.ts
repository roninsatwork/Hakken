import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  webServer: {
    command: "npm run dev -- -p 3100",
    env: {
      LOCAL_TEST_AUTH_ENABLED: "1",
    },
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "real-auth-unauthenticated",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /local-real-auth-smoke\.spec\.ts/,
      grep: /@real-auth-public/,
    },
    {
      name: "real-auth-super-admin",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /local-real-auth-smoke\.spec\.ts/,
      grep: /@real-auth-super-admin/,
    },
    {
      name: "real-auth-user",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /local-real-auth-smoke\.spec\.ts/,
      grep: /@real-auth-user/,
    },
  ],
});
