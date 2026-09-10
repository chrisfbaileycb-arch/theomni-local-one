// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const path = require('path');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
// Each run gets a throwaway memory core so tests never see another run's data (see global-setup.js).
const DATA_DIR = process.env.OMNILOCAL_DATA_DIR || path.join(require('os').tmpdir(), 'omnilocal-e2e-data');

module.exports = defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1400, height: 900 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node server.js',
    url: `${BASE_URL}/api`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { OMNILOCAL_DATA_DIR: DATA_DIR, PORT: String(PORT) },
  },
});
