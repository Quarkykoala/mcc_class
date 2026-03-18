import { test, expect } from '@playwright/test';

test('smoke: sign in and save a draft', async ({ page, request }) => {
  const email = `demo-${Date.now()}@mcc.local`;
  const password = 'admin123';

  const registerRes = await request.post('http://localhost:3000/api/auth/register', {
    data: { email, password },
  });
  if (!registerRes.ok() && registerRes.status() !== 409) {
    throw new Error(`Failed to register test user: ${registerRes.status()}`);
  }

  await page.goto('/');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Get Started' }).click();

  await page.getByRole('heading', { name: 'Letter Workspace' }).waitFor();

  await page.getByPlaceholder('Letter title').fill('Smoke Test Letter');
  await page.getByPlaceholder('Job reference (optional)').fill('SMOKE-001');
  await page.getByPlaceholder('Compose letter body in markdown...').fill('Smoke test content');
  await page.getByRole('button', { name: 'Save Draft' }).click();

  await expect(page.getByText('Draft saved successfully.')).toBeVisible();
});

test('new letter selects a fresh draft and resets workflow controls', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Email').fill('admin@mcc.local');
  await page.getByPlaceholder('Password').fill('admin123');
  await page.getByRole('button', { name: 'Get Started' }).click();

  await page.getByRole('heading', { name: 'Letter Workspace' }).waitFor();

  await page.getByPlaceholder('Letter title').fill('Existing draft title');
  await page.getByPlaceholder('Compose letter body in markdown...').fill('Existing draft body');

  await page.getByRole('button', { name: 'NEW LETTER' }).click();

  await expect(page.getByPlaceholder('Letter title')).toHaveValue('Untitled letter');
  await expect(page.getByPlaceholder('Compose letter body in markdown...')).toHaveValue('Start writing your letter here.');

  await expect(page.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Route/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Submit/i })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Approve/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Reject/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Issue/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Print/i })).toBeDisabled();
});
