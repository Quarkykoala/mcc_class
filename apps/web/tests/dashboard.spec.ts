import { test, expect } from '@playwright/test';

test.describe('Dashboard and Audit Log', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('MCC Letter Issuance')).toBeVisible();
        await page.getByRole('button', { name: /Login as Guest \/ Demo/i }).click();
        // Ensure the header branding is visible, confirming dashboard load
        await expect(page.getByRole('link', { name: 'MCC Issuance', exact: true })).toBeVisible({ timeout: 15000 });
    });

    test('should verify components and tab switching', async ({ page }) => {
        // "MCC Issuance" is a link in the header
        await expect(page.getByRole('link', { name: 'MCC Issuance', exact: true })).toBeVisible();

        // Verify Dashboard tab is active by default
        await expect(page.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('data-state', 'active');

        // Check if "Create Letter" card is visible
        await expect(page.getByRole('heading', { name: 'Create Letter', exact: true })).toBeVisible();

        // Verify Department dropdown exists
        const selectTrigger = page.getByRole('combobox').first();
        await expect(selectTrigger).toBeVisible();

        // Open dropdown
        await selectTrigger.click();

        // Verify we see the listbox
        await expect(page.getByRole('listbox')).toBeVisible();

        // Switch to Audit Log tab
        await page.getByRole('tab', { name: 'Audit Log' }).click();
        await expect(page.getByRole('tab', { name: 'Audit Log' })).toHaveAttribute('data-state', 'active');

        // Check if Audit Log table is visible
        await expect(page.getByRole('table')).toBeVisible();

        // Click on the first row (if any logs exist)
        const firstRow = page.locator('tbody tr').first();
        const rowCount = await firstRow.count();

        if (rowCount > 0) {
            await firstRow.click();
            // Verify Audit Log Details modal opens
            await expect(page.getByText('Audit Log Details')).toBeVisible();
            await expect(page.getByText('Full Metadata Payload')).toBeVisible();

            // Close modal
            await page.getByRole('button', { name: 'Close' }).click();
            await expect(page.getByText('Audit Log Details')).not.toBeVisible();
        }
    });
});
