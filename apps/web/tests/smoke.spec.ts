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
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByText('Letter Workspace').waitFor();

  await page.getByPlaceholder('Letter title').fill('Smoke Test Letter');
  await page.getByPlaceholder('Job reference (optional, e.g. JOB-2026-0042)').fill('SMOKE-001');
  await page.getByPlaceholder('Compose letter body in markdown').fill('Smoke test content');
  await page.getByRole('button', { name: 'Save Draft' }).click();

  await expect(page.getByText('Draft saved.')).toBeVisible();
});
