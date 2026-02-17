import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('shows email/password form when unauthenticated', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByPlaceholder('Email')).toBeVisible();
        await expect(page.getByPlaceholder('Password')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    });
});
