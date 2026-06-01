import { test, expect } from '@playwright/test';

test.describe('Role-Based UI Suppression', () => {
  test('super_admin_role_hidden_from_dropdown', async ({ page }) => {
    await page.goto('/admin/users/invite');

    const roleSelect = page.locator('select[name="role"], select#role, select#role-dropdown').first();

    if (await roleSelect.isVisible()) {
      const options = await roleSelect.locator('option').allInnerTexts();
      const upperOptions = options.map((option) => option.toUpperCase());

      expect(upperOptions.includes('SUPER_ADMIN') || upperOptions.includes('SUPER ADMIN')).toBe(false);
    }
  });

  test('global_settings_routes_blocked', async ({ page }) => {
    await page.goto('/admin/ai/models');

    const currentUrl = page.url();
    const isRedirected = !currentUrl.includes('/admin/ai/models') || currentUrl.includes('/login');
    const isAccessDenied = await page.getByText(/Unauthorized|Access Denied|404|Page Not Found/i).isVisible();

    expect(isRedirected || isAccessDenied).toBe(true);
  });
});
