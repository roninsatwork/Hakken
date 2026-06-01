import { test, expect } from '@playwright/test';
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from '../helpers/navigation';

test.describe('Admin Dashboard Paginated Tables', () => {
  test.beforeEach(async ({ page }) => {
    await gotoWithoutServerCrash(page, '/admin/ai/models');
    await skipWhenRedirectedToLogin(page, 'Admin table behavior requires an authenticated admin storage state.');
  });

  test('Pagination limits and bounds correctly adjust', async ({ page }) => {
    await page.waitForSelector('table', { state: 'visible' });

    await expect(page.getByText(/Showing 1 to/i)).toBeVisible();

    const prevButton = page.locator('button', { has: page.locator('svg.lucide-chevron-left') });
    await expect(prevButton).toBeDisabled();

    const nextButton = page.locator('button', { has: page.locator('svg.lucide-chevron-right') });
    if (await nextButton.isEnabled()) {
        await nextButton.click();
        await expect(page.getByText(/Showing 16 to/i)).toBeVisible();
    }
  });

  test('Search filtering natively resets pagination to page 1', async ({ page }) => {
    await gotoWithoutServerCrash(page, '/admin/ai/rules');
    await skipWhenRedirectedToLogin(page, 'Admin table behavior requires an authenticated admin storage state.');
    await page.waitForSelector('table', { state: 'visible' });

    const searchInput = page.getByPlaceholder(/Search|Cerca/i);
    await searchInput.fill('Strict Testing Vector');
    
    // Pagination should immediately reset to Showing 1 
    await expect(page.getByText(/Showing 1 to/i)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0); // If random text is inserted
  });
});
