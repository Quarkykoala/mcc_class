import { expect, test } from '@playwright/test';

test('renders the demo app shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'BLANK LETTER' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'USE TEMPLATE' })).toBeVisible();
});
