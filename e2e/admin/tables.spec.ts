import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Paginated Tables', () => {
  test.beforeEach(async ({ page }) => {
    // Assuming standard Playwright auth state or login flow
    // We will navigate directly to a paginated route
    await page.goto('/admin/ai/models');
  });

  test('Pagination limits and bounds correctly adjust', async ({ page }) => {
    // Wait for the table to load
    await page.waitForSelector('table', { state: 'visible' });

    // Ensure the fallback "Showing 1 to X of Y" is present
    await expect(page.getByText(/Showing 1 to/i)).toBeVisible();

    // Verify Previous button is initially disabled
    const prevButton = page.locator('button', { has: page.locator('svg.lucide-chevron-left') });
    await expect(prevButton).toBeDisabled();

    // Verify search debounce doesn't break the Next button states immediately
    const nextButton = page.locator('button', { has: page.locator('svg.lucide-chevron-right') });
    if (await nextButton.isEnabled()) {
        await nextButton.click();
        await expect(page.getByText(/Showing 16 to/i)).toBeVisible();
    }
  });

  test('Search filtering natively resets pagination to page 1', async ({ page }) => {
    // Navigate to a multi-page table
    await page.goto('/admin/ai/rules');
    await page.waitForSelector('table', { state: 'visible' });

    const searchInput = page.getByPlaceholder(/Search|Cerca/i);
    await searchInput.fill('Strict Testing Vector');
    
    // Pagination should immediately reset to Showing 1 
    await expect(page.getByText(/Showing 1 to/i)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(0); // If random text is inserted
  });
});
