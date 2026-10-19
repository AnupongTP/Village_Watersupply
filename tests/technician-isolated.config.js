import { defineConfig } from '@playwright/test';

// Local socket access may be restricted. Technician tests route every request
// to local source files or synthetic API responses, so no web server is needed.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'technician-mock.spec.js',
  reporter: 'list',
  workers: 1,
  use: {
    browserName: 'chromium',
    launchOptions: process.env.VWS_TEST_CHROME_PATH
      ? { executablePath: process.env.VWS_TEST_CHROME_PATH }
      : undefined
  }
});
