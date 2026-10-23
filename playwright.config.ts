import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const data = mkdtempSync(join(tmpdir(), 'afm-browser-'));
export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.ts',
  timeout: 30000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:15173', headless: true, screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:17310/health',
      reuseExistingServer: false,
      env: {
        AFM_ADMIN_TOKEN: 'browser-test-operator-token-at-least-24',
        AFM_DATA_DIR: data,
        AFM_PORT: '17310',
        AFM_DEV_ORIGIN: 'http://127.0.0.1:15173',
      },
    },
    {
      command: 'npm run dev:web',
      url: 'http://127.0.0.1:15173',
      reuseExistingServer: false,
      env: { AFM_PORT: '17310', AFM_WEB_PORT: '15173' },
    },
  ],
});
