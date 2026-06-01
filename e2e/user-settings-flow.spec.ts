import { test, expect } from '@playwright/test';
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from './helpers/navigation';

test.describe('End-User Profile & Settings Journey', () => {
  test('User can view profile, interact with fields, and save changes', async ({ page }) => {
    await gotoWithoutServerCrash(page, '/app/profile');
    await skipWhenRedirectedToLogin(page, 'Profile settings coverage requires an authenticated user storage state.');

    // 1. Ensure the Profile interface is mounted
    await expect(page.getByText('My Profile')).toBeVisible({ timeout: 10000 });

    // 2. Verify critical form fields are present
    const nameInput = page.locator('input[type="text"]').first();
    const emailInput = page.locator('input[type="email"]');
    const phoneInput = page.locator('input[type="tel"]');

    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
    await expect(phoneInput).toBeVisible();

    // 3. Verify Email is locked (disabled) as per security rules
    await expect(emailInput).toBeDisabled();

    // 4. Simulate modifying a user preference (e.g., phone number)
    const testPhone = `+1555${Math.floor(100000 + Math.random() * 900000)}`;
    await phoneInput.fill(testPhone);

    // 5. Submit changes
    const saveButton = page.locator('button[type="submit"]', { hasText: /Save|Saving/i });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).not.toBeDisabled();
    
    await saveButton.click();

    // 6. Verify Success State appears
    // The component renders a CheckCircle with "Saved" upon success
    const successIndicator = page.locator('text=Saved').first();
    await expect(successIndicator).toBeVisible({ timeout: 5000 });

    // 7. Verify Theme Toggle in the Header is accessible
    const themeToggle = page.locator('button[aria-label="Toggle theme"], .theme-toggle').first();
    if (await themeToggle.isVisible()) {
        await themeToggle.click();
        // Just verify it doesn't crash the page upon clicking
        await expect(page.locator('body')).toBeVisible();
    }
  });
});
