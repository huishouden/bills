import { defineConfig, devices } from '@playwright/test';

// Smoke tests against a deployed site: BASE_URL defaults to production.
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'https://huishouden-bills.web.app',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'tablet', use: { ...devices['Galaxy Tab S4'], viewport: { width: 1280, height: 800 } } },
  ],
});
