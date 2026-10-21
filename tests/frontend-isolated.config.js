import { defineConfig } from '@playwright/test';
import path from 'node:path';

// These specs intercept every browser request before navigation and serve
// synthetic API responses plus local files without starting an HTTP server.
export default defineConfig({
  testDir: process.env.VWS_FRONTEND_SOURCE_ROOT
    ? path.join(process.env.VWS_FRONTEND_SOURCE_ROOT, 'tests/e2e')
    : './e2e',
  testMatch: /(?:technician-mock|public-dataset-isolated|public-list-isolated)\.spec\.js/,
  outputDir: process.env.VWS_PARITY_OUTPUT_DIR || 'test-results',
  reporter: 'list',
  workers: 1,
  use: {
    browserName: 'chromium',
    launchOptions: process.env.VWS_TEST_CHROME_PATH
      ? { executablePath: process.env.VWS_TEST_CHROME_PATH }
      : undefined
  }
});
