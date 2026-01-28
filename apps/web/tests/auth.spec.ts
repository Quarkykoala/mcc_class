import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('should login as guest / demo', async ({ page }) => {
        await page.goto('/');

        // Check if we are on the sign-in page
        await expect(page.getByText('MCC Letter Issuance')).toBeVisible();

        // Click Login as Guest / Demo
        const demoButton = page.getByRole('button', { name: /Login as Guest \/ Demo/i });
        await demoButton.click();

        // Verify we are logged in and see the dashboard
        try {
            // Check for the "MCC Issuance" branding in the header
            await expect(page.getByRole('link', { name: 'MCC Issuance', exact: true })).toBeVisible({ timeout: 15000 });
            // The demo user email
            await expect(page.getByText('demo@example.com')).toBeVisible();
            // Verify Dashboard tab is visible and active
            await expect(page.getByRole('tab', { name: 'Dashboard' })).toBeVisible();
        } catch (e) {
            await page.screenshot({ path: 'auth-failure.png' });
            throw e;
        }
    });
});
