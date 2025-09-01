import { test, expect } from '@playwright/test';
import axe from '@axe-core/playwright';

async function assertA11y(page, contextLabel){
  const results = await axe.run(page, { runOnly: ['wcag2a', 'wcag2aa'] });
  const violations = results.violations;
  const critical = violations.filter(v => v.impact === 'critical');
  // Threshold gating: allow up to 0 critical, max 3 total minor/moderate
  const nonCritical = violations.filter(v => v.impact !== 'critical');
  if(critical.length > 0 || nonCritical.length > 3){
    throw new Error(`Accessibility threshold exceeded on ${contextLabel}. Critical: ${critical.length}, other: ${nonCritical.length}\n` + JSON.stringify(violations, null, 2));
  }
}

// Basic accessibility scan of login and dashboard

test.describe('Accessibility', () => {
  test('login page passes thresholds', async ({ page }) => {
    await page.goto('/login');
    await assertA11y(page, 'login');
  });

  test('dashboard page passes thresholds post-login (admin)', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('username').fill(process.env.ADMIN_USER || 'admin');
    await page.getByLabel('password').fill(process.env.ADMIN_PASS || '123');
    await page.getByLabel('login button').click();
    await page.waitForURL(/\/$/);
    await assertA11y(page, 'dashboard');
  });
});
