import { test, expect } from '@playwright/test';

// Assumes backend on 4000 & frontend 5173 already running

test.describe('Authentication & Protected Routes', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*login/);
  });

  test('successful admin login persists and grants dashboard access', async ({ page }) => {
    await page.goto('/login');
  // Use env vars if provided; fallback aligns with backend .env.example (ADMIN_PASS=123)
  await page.getByLabel('username').fill(process.env.ADMIN_USER || 'admin');
  await page.getByLabel('password').fill(process.env.ADMIN_PASS || '123');
    await page.getByLabel('login button').click();
    await expect(page).toHaveURL(/\/$/);
    // Storage check
    const auth = await page.evaluate(()=> localStorage.getItem('hcp_auth'));
    expect(auth).toBeTruthy();
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('consumer registration + verification + consumer login flow', async ({ page }) => {
    test.slow();
    await page.goto('/login');
    // Admin login to access registration page (protected)
    await page.getByLabel('username').fill(process.env.ADMIN_USER || 'admin');
    await page.getByLabel('password').fill(process.env.ADMIN_PASS || '123');
    await page.getByLabel('login button').click();
    await expect(page).toHaveURL(/\/$/);

    // Go to registration
    await page.goto('/register');
    await page.getByRole('button', { name: 'Consumer' }).click();
    await page.getByLabel('Name').fill('Test Consumer');
    const email = `test${Date.now()}@example.com`;
    const password = 'secret12';
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Registered\./)).toBeVisible();

    // Extract verification token text (format: Token (dev only): <token>)
    const tokenLine = await page.getByText(/Token \(dev only\):/).innerText();
    const verifyToken = tokenLine.split(':').pop().trim();
    // Enter token and verify
    await page.getByLabel('Enter Verification Token').fill(verifyToken);
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByText('Verified!')).toBeVisible();

    // Logout admin
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/login/);

    // Switch to consumer login mode and login with new consumer credentials
    await page.getByRole('button', { name: 'Consumer' }).click();
    await page.getByLabel('username').fill(email); // field label changes based on mode
    await page.getByLabel('password').fill(password);
    await page.getByLabel('login button').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Consumer Dashboard')).toBeVisible();
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('username').fill('wrong');
    await page.getByLabel('password').fill('wrong');
    await page.getByLabel('login button').click();
    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });
});
