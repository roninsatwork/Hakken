import { test, expect } from '@playwright/test';
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from './helpers/navigation';

test.describe('End-User Chat Journey @smoke', () => {
  test('User can type a message, submit, and transition to a thread', async ({ page }) => {
    await gotoWithoutServerCrash(page, '/app/assistant');
    await skipWhenRedirectedToLogin(page, 'Chat execution requires an authenticated user storage state.');
    await expect(page.getByText(/E2E User/i).first()).toBeVisible({ timeout: 10000 });

    // 1. Ensure the core chat input area is mounted and visible
    const chatInput = page.locator('textarea');
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await expect(chatInput).toHaveAttribute('placeholder', /Enter a prompt/i);

    // 2. Simulate User Input
    const testMessage = `Hello Sonae, run system diagnostic ${Date.now()}`;
    await chatInput.click();
    await chatInput.pressSequentially(testMessage);
    await expect(chatInput).toHaveValue(testMessage);

    // 3. Verify Submit Button becomes active and submit
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).not.toBeDisabled();
    await submitButton.click();

    // 4. Verify transition to a dedicated thread view
    // The URL should update from /app/assistant to /app/assistant/[threadId]
    await expect(page).toHaveURL(/\/app\/assistant\/[a-zA-Z0-9_-]+/, { timeout: 15000 });

    // 5. Verify the user's input rendered in the conversation history
    const userMessage = page.locator(`text=${testMessage}`);
    await expect(userMessage).toBeVisible({ timeout: 15000 });
    
    // 6. Verify AI is generating or has generated a response
    // We expect either a streaming indicator or an assistant message block to appear
    await expect(page.getByText(/E2E assistant response ready|Thinking/i).first()).toBeVisible({ timeout: 30000 });
  });

  test('User can rate an answer and the choice survives a revisit', async ({ page }) => {
    await gotoWithoutServerCrash(page, '/app/assistant');
    await skipWhenRedirectedToLogin(page, 'Chat feedback requires an authenticated user storage state.');

    const chatInput = page.locator('textarea');
    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.click();
    await chatInput.pressSequentially(`Feedback check ${Date.now()}`);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/app\/assistant\/[a-zA-Z0-9_-]+/, { timeout: 15000 });

    // The controls appear only once the reply has finished streaming.
    const helpful = page.getByRole('button', { name: 'Helpful' }).first();
    await expect(helpful).toBeVisible({ timeout: 30000 });
    await helpful.click();
    await expect(helpful).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });

    // A reload must show the same choice — the rating is stored, not local state.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Helpful' }).first()).toHaveAttribute(
      'aria-pressed',
      'true',
      { timeout: 15000 },
    );

    // Changing to "Not right" opens the one-tap label picker.
    const notRight = page.getByRole('button', { name: 'Not right' }).first();
    await notRight.click();
    await expect(notRight).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });
    await expect(page.getByText('What went wrong?')).toBeVisible({ timeout: 10000 });
  });
});
