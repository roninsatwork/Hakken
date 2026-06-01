import { test, expect } from '@playwright/test';
import { gotoWithoutServerCrash } from './helpers/navigation';

test.describe('OWASP: Security & Routing Protections', () => {

  test('Unauthenticated users are redirected from Admin interfaces to Login', async ({ page }) => {
    await gotoWithoutServerCrash(page, '/admin/agents');
    
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('Unauthenticated users are redirected from the main tenant switchboards', async ({ page }) => {
    await gotoWithoutServerCrash(page, '/app');
    
    await expect(page).toHaveURL(/.*\/login/);
  });
  
  test('Login route is accessible without authentication', async ({ page }) => {
    const response = await gotoWithoutServerCrash(page, '/login');
    
    expect(response?.url()).toContain('/login');
    await expect(page.getByRole('button', { name: /google|continue|sign/i }).first()).toBeVisible();
  });
});
