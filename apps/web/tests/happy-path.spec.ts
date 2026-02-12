import { expect, test } from '@playwright/test';

test('demo workspace happy path shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Letter Workspace')).toBeVisible();
  await expect(page.getByText('Stage Panel')).toBeVisible();
});
