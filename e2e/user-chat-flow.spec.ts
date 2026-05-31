import { test, expect } from '@playwright/test';

test.describe('End-User Chat Journey', () => {
  test('User can type a message, submit, and transition to a thread', async ({ page }) => {
    // Navigate to the primary Assistant interaction interface
    await page.goto('/app/assistant');
    
    // Check if the application enforced authentication and redirected to login
    // If we are unauthenticated during a local smoke test, gracefully bypass the DOM assertions
    if (page.url().includes('/login')) {
       console.log('Skipping E2E Chat Execution: Environment is not authenticated.');
       test.skip();
       return;
    }

    // 1. Ensure the core chat input area is mounted and visible
    const chatInput = page.locator('textarea');
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 2. Simulate User Input
    const testMessage = `Hello Sonae, run system diagnostic ${Date.now()}`;
    await chatInput.fill(testMessage);

    // 3. Verify Submit Button becomes active and submit
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).not.toBeDisabled();
    await submitButton.click();

    // 4. Verify transition to a dedicated thread view
    // The URL should update from /app/assistant to /app/assistant/[threadId]
    await expect(page).toHaveURL(/\/app\/assistant\/[a-zA-Z0-9_-]+/);

    // 5. Verify the user's input rendered in the conversation history
    const userMessage = page.locator(`text=${testMessage}`);
    await expect(userMessage).toBeVisible();
    
    // 6. Verify AI is generating or has generated a response
    // We expect either a streaming indicator or an assistant message block to appear
    const assistantResponseBlock = page.locator('.assistant-message, .streaming-indicator, [data-role="assistant"]').first();
    await expect(assistantResponseBlock).toBeVisible({ timeout: 20000 });
  });
});
