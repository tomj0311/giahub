# Playwright Tests

Prerequisites: backend on :4000 and frontend on :5173 running.

Install Playwright (from repo root or frontend):

npm install -D @playwright/test
npx playwright install

Run tests:

npx playwright test

Environment (for admin test): set ADMIN_USER and ADMIN_PASS when running tests if changed from defaults.
