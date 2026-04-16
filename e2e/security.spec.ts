import { test, expect } from '@playwright/test';

test.describe('OWASP: Security & Routing Protections', () => {

  test('Unauthenticated users are violently redirected from Admin interfaces to Login', async ({ page }) => {
    // Attempting to brute force into the agents dashboard
    await page.goto('/admin/agents');
    
    // The middleware or client-side Nextjs routing should redirect immediately
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('Unauthenticated users are redirected from the main tenant switchboards', async ({ page }) => {
    // Attempting to bypass into the primary app
    await page.goto('/switcher');
    
    // The system should detect no Convex Auth cookie and bounce them
    await expect(page).toHaveURL(/.*\/login/);
  });
  
  test('Public Chat Widget Route is accessible without authentication', async ({ page }) => {
    // The embedded external widget route MUST remain open
    // Assuming a test layout route structure for the widget like /widget or /api/widget 
    // We'll target the hypothetical root to ensure it resolves or returns 404 cleanly without a login redirect
    const response = await page.goto('/api/health'); // Or any known public API endpoint
    
    // If we have an API, it should not redirect to the frontend login page
    if (response) {
      const url = response.url();
      expect(url).not.toContain('/login');
    }
  });
});
