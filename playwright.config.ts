import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  // Builds dashboard/dist once before any test runs.
  globalSetup: './test/e2e/global-setup.ts',
  reporter: 'list',
  timeout: 20_000,
  use: { trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
