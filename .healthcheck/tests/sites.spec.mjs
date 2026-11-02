import { test, expect } from '@playwright/test';
import { URLS, mobileMeasure, openPublic, record } from './helpers.mjs';

for (const [name, url, contact] of [
  ['想月トップ', URLS.sogetsu, false],
  ['想月お問い合わせ', URLS.sogetsuContact, true],
  ['Sea Lightトップ', URLS.sealight, false],
  ['Sea Lightお問い合わせ', URLS.sealightContact, true],
]) {
  test(name, async ({ page }, testInfo) => {
    await openPublic(page, url);
    const heading = name === '想月トップ'
      ? page.getByRole('heading', { name: 'はじめてご相談される方へ', exact: true })
      : page.locator('h1').first();
    await expect(heading).toBeVisible();
    await mobileMeasure(page, testInfo, name + '・上部');
    if (contact) {
      // フォームの存在と画面内表示だけを検証。入力・送信しない。
      const fields = page.locator('form input:not([type="hidden"]),form textarea,iframe');
      let field;
      for (let i = 0; i < await fields.count(); i++) {
        if (await fields.nth(i).isVisible()) { field = fields.nth(i); break; }
      }
      expect(field, '問い合わせ欄または埋込フォームがありません').toBeTruthy();
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
      const rect = await field.boundingBox();
      expect(rect.x, '問い合わせ欄が左にはみ出しています').toBeGreaterThanOrEqual(-2);
      expect(rect.x + rect.width, '問い合わせ欄が右にはみ出しています').toBeLessThanOrEqual(392);
      await mobileMeasure(page, testInfo, name + '・問い合わせ欄');
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await mobileMeasure(page, testInfo, name + '・下部');
    await record(testInfo, name, 'passed', { url, formSubmitted: false });
  });
}
