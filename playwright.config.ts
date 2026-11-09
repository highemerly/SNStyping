// E2E スモーク（docs/development.md「E2E」）。
// 偽の辞書配信・Worker（wrangler dev = workerd）・画面（next build && next start）を立ててから e2e/ を流す。
// 手元の開発サーバー（3100・8787）とぶつからないよう、専用のポートを使う。
import { defineConfig, devices } from '@playwright/test';

const SITE_PORT = 3199;
const WORKER_PORT = 8799;
const DICT_PORT = 8798;
const DICT_URL = `http://127.0.0.1:${DICT_PORT}/`;
export const WORKER_URL = `http://127.0.0.1:${WORKER_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  // まずは「動くか」だけを見る。リトライで落ちを隠さない
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${SITE_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `node e2e/fixture-server.mjs ${DICT_PORT}`,
      url: `${DICT_URL}words.json`,
      reuseExistingServer: false,
    },
    {
      command: `npx wrangler dev -c realtime/wrangler.jsonc --ip 127.0.0.1 --port ${WORKER_PORT} --var DICT_BASE_URL:${DICT_URL} --persist-to e2e/.wrangler-state`,
      url: `${WORKER_URL}/api/rooms`,
      reuseExistingServer: false,
      env: { WRANGLER_SEND_METRICS: 'false' },
      timeout: 60_000,
    },
    {
      // NEXT_PUBLIC_* はビルド時に埋め込まれるので、ビルドから行う
      command: `npx next build && npx next start -H 127.0.0.1 -p ${SITE_PORT}`,
      url: `http://127.0.0.1:${SITE_PORT}/`,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_REALTIME_URL: WORKER_URL,
        NEXT_PUBLIC_DICT_BASE_URL: DICT_URL,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      timeout: 180_000,
    },
  ],
});
