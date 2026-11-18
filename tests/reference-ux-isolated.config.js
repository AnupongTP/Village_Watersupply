import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: ['reference-ux-isolated.spec.js', 'reference-review-regressions.spec.js'],
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  outputDir: process.env.VWS_PARITY_OUTPUT_DIR || '../test-results',
  use: {
    browserName: 'chromium',
    actionTimeout: 8000,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure'
  }
});
