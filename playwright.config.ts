import path from 'node:path';
import { defineConfig } from '@playwright/test';

const rootDir = '/Volumes/ai-work/dst-launcher';
const sidecarUrl = 'http://127.0.0.1:45991';
const webUrl = 'http://127.0.0.1:41031';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: false,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: path.join(rootDir, '.tmp/playwright/test-results'),
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.join(rootDir, '.tmp/playwright/report') }],
  ],
  use: {
    baseURL: webUrl,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  webServer: [
    {
      command: "bash -lc 'rm -rf ./.tmp/e2e/app-data && mkdir -p ./.tmp/e2e/app-data && exec node ./apps/sidecar/dist/index.cjs --port 45991 --app-data ./.tmp/e2e/app-data'",
      cwd: rootDir,
      url: `${sidecarUrl}/health`,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: "bash -lc 'export PORT=41031 NEXT_OUTPUT_MODE=server NEXT_PUBLIC_SIDECAR_URL=http://127.0.0.1:45991; exec pnpm --filter @dst-launcher/web start'",
      cwd: rootDir,
      url: `${webUrl}/projects/new`,
      reuseExistingServer: false,
      timeout: 20_000,
    },
  ],
});
