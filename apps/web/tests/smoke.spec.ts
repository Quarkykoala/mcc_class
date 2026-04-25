import { test, expect } from '@playwright/test';

test('smoke: sign in and save a draft', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('heading', { name: 'My Tasks' }).waitFor();

  await page.getByRole('button', { name: 'BLANK LETTER' }).click();
  await page.getByRole('heading', { name: 'Letter Workspace' }).waitFor();
  await page.getByPlaceholder('Letter title').fill('Smoke Test Letter');
  await page.getByPlaceholder('To section').fill('To,\nSmoke Recipient');
  await page.getByPlaceholder('Subject').fill('Smoke subject');
  await page.getByPlaceholder('C Number / Customs Job Reference (optional)').fill('SMOKE-001');
  await page.getByPlaceholder('Compose letter body in markdown...').fill('Smoke test content');
  await page.getByRole('button', { name: 'Save Draft' }).click();

  await expect(page.getByText('Draft saved successfully.')).toBeVisible();
});

test('new letter selects a fresh draft and resets workflow controls', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('heading', { name: 'My Tasks' }).waitFor();

  await page.getByRole('button', { name: 'BLANK LETTER' }).click();
  await page.getByRole('heading', { name: 'Letter Workspace' }).waitFor();

  await page.getByPlaceholder('Letter title').fill('Existing draft title');
  await page.getByPlaceholder('Compose letter body in markdown...').fill('Existing draft body');

  await page.getByRole('button', { name: 'USE TEMPLATE' }).click();

  await expect(page.getByPlaceholder('Letter title')).toHaveValue('Official letter');
  await expect(page.getByPlaceholder('Subject')).toHaveValue('Subject:');
  await expect(page.getByPlaceholder('To section')).toHaveValue(/Recipient name/);

  await expect(page.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Route/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Submit/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'check Approve' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'close Reject' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'verified Issue' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'print Print' })).toBeDisabled();
});
