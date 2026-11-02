import { test, expect } from '@playwright/test';
import { URLS, openPublic, enterPaid, mobileMeasure, checkAudio, record } from './helpers.mjs';

test('有料アプリ：スマホ表示と当日の保存復元', async ({ page }, testInfo) => {
  await openPublic(page, URLS.paid);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /^journal-\d{4}-\d{2}-\d{2}$/.test(key))), '専用の空contextではありません').toBe(false);
  await enterPaid(page);
  await mobileMeasure(page, testInfo, '有料アプリ・ホーム');
  await page.locator('.nav-btn[data-page="journal"]').click();
  await expect(page.locator('#journal-entry')).toHaveValue('');
  const marker = `healthcheck-${Date.now()}-${testInfo.retry}`;
  await page.locator('#journal-entry').fill(marker);
  await mobileMeasure(page, testInfo, '有料アプリ・ジャーナル');
  await page.locator('#btn-save-journal').click();
  await page.locator('.nav-btn[data-page="meditation"]').click();
  await page.locator('.nav-btn[data-page="journal"]').click();
  await expect(page.locator('#journal-entry')).toHaveValue(marker);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterPaid(page);
  await page.locator('.nav-btn[data-page="journal"]').click();
  await expect(page.locator('#journal-entry')).toHaveValue(marker);
  await record(testInfo, '有料アプリ・保存と再読込', 'passed', { syntheticOnly: true, valueRestored: true });
});

for (const [category, title] of [
  ['meditation', 'もう頑張れないと感じたとき'],
  ['stories', 'アーミッシュの許しについて'],
]) {
  test(`有料アプリ音声：${title}`, async ({ page }, testInfo) => {
    test.setTimeout(100_000);
    await openPublic(page, URLS.paid);
    await enterPaid(page);
    await checkAudio(page, testInfo, category, title);
    await mobileMeasure(page, testInfo, `有料アプリ・${category}一覧`);
  });
}
