import { test, expect } from '@playwright/test';

test.describe('Verification Route', () => {
    test('renders verification payload view', async ({ page }) => {
        await page.route('**/api/verify/**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    valid: true,
                    status: 'ISSUED',
                    context: 'COMPANY'
                })
            });
        });

        await page.goto('/verify/test-token');

        const payload = page.locator('pre');
        await expect(payload).toBeVisible();
        await expect(payload).toContainText('"valid": true');
        await expect(payload).toContainText('"status": "ISSUED"');
    });
});
