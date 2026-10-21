import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'public-dataset-isolated.spec.js',
  reporter: 'list',
  workers: 1,
  use: {
    browserName: 'chromium',
    launchOptions: process.env.VWS_TEST_CHROME_PATH
      ? { executablePath: process.env.VWS_TEST_CHROME_PATH }
      : undefined
  }
});
