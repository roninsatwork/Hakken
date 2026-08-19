import { test, expect } from '@playwright/test';
import { collectPageErrors, gotoWithoutServerCrash } from './helpers/navigation';

test.describe('Admin Dashboard: Layout & Render Stability @smoke', () => {
  const criticalAdminRoutes = [
    '/admin',
    '/admin/companies',
    '/admin/agents',
    '/admin/ai/models',
    '/admin/ai/tools',
    '/admin/ai/global-knowledge',
    '/admin/ai/chat-logs',
    '/admin/ai/costs',
    '/admin/users',
    '/admin/workflows',
    '/admin/workflows/schedules',
    '/admin/settings/plans',
  ];

  for (const route of criticalAdminRoutes) {
    test(`route ${route} returns a non-5xx shell or auth redirect`, async ({ page }) => {
      const pageErrors = collectPageErrors(page);

      await gotoWithoutServerCrash(page, route);

      if (page.url().includes('/login')) {
        await expect(page).toHaveURL(/.*\/login/);
      } else {
        await expect(page.locator('body')).toBeVisible();
      }

      expect(pageErrors).toEqual([]);
    });
  }
});
