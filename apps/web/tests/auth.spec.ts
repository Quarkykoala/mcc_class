import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('auto-enters the demo workspace without a login form', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible();
        await expect(page.getByText('admin@mcc.local')).toBeVisible();
        await expect(page.getByPlaceholder('Email')).toHaveCount(0);
    });
});
