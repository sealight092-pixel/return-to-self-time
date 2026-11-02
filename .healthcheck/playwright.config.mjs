import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 55_000,
  globalTimeout: 420_000,
  expect: { timeout: 12_000 },
  workers: 1,
  fullyParallel: false,
  retries: 1,
  reporter: [['./reporter.mjs']],
  use: {
    browserName: 'chromium',
    channel: 'chrome',
    headless: true,
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    ignoreHTTPSErrors: false,
    serviceWorkers: 'allow',
    actionTimeout: 12_000,
    navigationTimeout: 25_000,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    // storageState、既存profile、cookieの取り込みは行わない。
    // Playwright Testのfixtureが各test（再試行を含む）に空contextを作る。
  },
});
