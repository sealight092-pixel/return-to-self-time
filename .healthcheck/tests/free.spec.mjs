import { test, expect } from '@playwright/test';
import { URLS, openPublic, enterFreeJournal, mobileMeasure, checkFreeBackground, record } from './helpers.mjs';

test('無料アプリ：スマホ表示と保存後の履歴復元', async ({ page }, testInfo) => {
  await openPublic(page, URLS.free);
  expect(await page.evaluate(() => localStorage.getItem('yoru_journal_entries')), '専用の空contextではありません').toBeNull();
  await mobileMeasure(page, testInfo, '無料アプリ・ホーム');
  await enterFreeJournal(page);
  await mobileMeasure(page, testInfo, '無料アプリ・入力画面');
  const marker = `healthcheck-${Date.now()}-${testInfo.retry}`;
  const answers = [1, 2, 3].map(index => `${marker}-q${index}`);
  for (let i = 0; i < 3; i++) await page.locator(`#q${i + 1}`).fill(answers[i]);
  await checkFreeBackground(page, testInfo);
  await page.getByRole('button', { name: '記録する', exact: true }).click();
  await expect(page.locator('#screen-saved')).toBeVisible();
  await page.getByRole('button', { name: '記録を見る', exact: true }).click();
  await expect(page.locator('#history-list .entry-card')).toHaveCount(1);
  await page.locator('#history-list .entry-card').click();
  for (const answer of answers) await expect(page.locator('#entry-content')).toContainText(answer);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '過去の記録を見る', exact: true }).click();
  await expect(page.locator('#history-list .entry-card')).toHaveCount(1);
  await page.locator('#history-list .entry-card').click();
  for (const answer of answers) await expect(page.locator('#entry-content')).toContainText(answer);
  await record(testInfo, '無料アプリ・3回答の保存と再読込', 'passed', { answersVerified: 3, entries: 1, syntheticOnly: true });
  // context破棄でテスト記録を消す。アプリの削除機能や他の利用者の保存先は触らない。
});
