import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Restricted to 1 worker locally to avoid DB collision during Option A tests
  reporter: 'html',
  webServer: {
    command: 'E2E_AUTH_ENABLED=1 NEXT_PUBLIC_E2E_AUTH_ENABLED=1 npm run dev -- -p 3100',
    url: 'http://localhost:3100/login',
    reuseExistingServer: false,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'unauthenticated',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [
        /auth-journey\.spec\.ts/,
        /admin-smoke\.spec\.ts/,
        /security\.spec\.ts/,
      ],
    },
    {
      name: 'super-admin',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/super-admin.json',
      },
      testMatch: [
        /admin\/journeys\.spec\.ts/,
        /admin\/workflow-widget-journeys\.spec\.ts/,
        /admin\/routes\.spec\.ts/,
        /admin\/tables\.spec\.ts/,
        /admin-roles\.spec\.ts/,
        /exports\.spec\.ts/,
      ],
    },
    {
      name: 'user',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      testMatch: [
        /user-chat-flow\.spec\.ts/,
        /user-settings-flow\.spec\.ts/,
      ],
    },
  ],
});
