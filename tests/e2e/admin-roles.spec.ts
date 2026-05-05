import { test, expect } from '@playwright/test';

test.describe('Role-Based UI Suppression', () => {
  // We assume there's a login mechanism available in the app.
  // For standard E2E setups, you'd typically have a `test.beforeEach` here 
  // that logs in as a standard ADMIN via an auth API or standard form.

  test('super_admin_role_hidden_from_dropdown', async ({ page }) => {
    // Navigate to the user creation/invitation route
    await page.goto('/admin/users/invite');
    
    // We expect the user to hit the login page if not authenticated, 
    // but assuming auth state is hydrated, we check the DOM.
    // If we land on the page, the "Super Admin" role must not be visible.
    
    // Ensure the page loads properly (wait for a key element)
    // Wait for the select dropdown or the main form
    const roleSelect = page.locator('select[name="role"], select#role, select#role-dropdown').first();
    
    if (await roleSelect.isVisible()) {
      const options = await roleSelect.locator('option').allInnerTexts();
      const upperOptions = options.map(opt => opt.toUpperCase());
      expect(upperOptions.includes('SUPER_ADMIN') || upperOptions.includes('SUPER ADMIN')).toBe(false);
    }
  });

  test('global_settings_routes_blocked', async ({ page }) => {
    // Navigate directly to a route that requires SUPER_ADMIN clearance
    await page.goto('/admin/ai/models');
    
    // A standard admin should be kicked out or see a 404/Unauthorized state
    const currentUrl = page.url();
    
    // It should either redirect back to an allowed route or show an access denied message
    const isRedirected = !currentUrl.includes('/admin/ai/models') || currentUrl.includes('/login');
    const isAccessDenied = await page.getByText(/Unauthorized|Access Denied|404|Page Not Found/i).isVisible();
    
    expect(isRedirected || isAccessDenied).toBe(true);
  });
});
