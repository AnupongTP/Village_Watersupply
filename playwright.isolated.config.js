import { defineConfig } from '@playwright/test';

// Browser routes in isolated specs serve local files and synthetic data before navigation.
// No local HTTP server or Production endpoint is required.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['public-list-isolated.spec.js', 'public-cache-isolated.spec.js', 'technician-mock.spec.js'],
  timeout: 40_000,
  expect: { timeout: 8_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  }
});
