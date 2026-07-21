import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

// The heavyweight movement browser tests, retired from the routine suite by
// Anthony (2026-07-21). Run explicitly with `npm run test:e2e:movement`.
// Their day-to-day coverage lives in the fast movement unit suite and the
// on-demand proof harnesses (mounted-game proof, live-game capture).
export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'super-admin',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/super-admin.json',
      },
      testMatch: [
        /on-demand\/movement-demo-authenticated\.spec\.ts/,
        /on-demand\/movement-avatar-proof\.eval\.spec\.ts/,
      ],
    },
  ],
});
