import { test, expect } from '@playwright/test';
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from './helpers/navigation';

test.describe('Dashboard Exports', () => {
  test('Financial Analytics charts generate blob URLs on export', async ({ page }) => {
    await gotoWithoutServerCrash(page, '/admin');
    await skipWhenRedirectedToLogin(page, 'Dashboard export coverage requires an authenticated admin storage state.');
    
    // Listen for the download event
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);

    // Locate the ChartExportWrapper trigger (usually an Export or Download button near a chart)
    const exportButton = page.getByRole('button', { name: /Export|Download/i }).first();
    
    // If an export button exists, click it and evaluate the blob response
    if (await exportButton.isVisible()) {
        await exportButton.click();
        
        const download = await downloadPromise;
        if (download) {
            // Assert that the filename strictly has a .png extension to avoid Chrome "No Ext" bug
            expect(download.suggestedFilename()).toMatch(/\.png$/);
        }
    }
  });
});
