// 公開された無料アプリを390px・320pxで毎日点検する。
// 各testは空の専用contextで表示と保存復元を確認し、下部白背景の再発も失敗にする。
// 公開URLをそのまま開く。route、応答差し替え、CSS注入は一切行わない。
import { test, expect } from '@playwright/test';
import { URLS, openPublic, enterFreeJournal, record } from './helpers.mjs';
import { pngPixel } from './algorithms.mjs';

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test.describe(`無料アプリ本番 ${viewport.width}×${viewport.height}`, () => {
    test.use({
      viewport, screen: viewport, deviceScaleFactor: 1,
      locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
      storageState: { cookies: [], origins: [] },
    });

    test('下部3か所の濃色背景と3回答の保存復元', async ({ page }, testInfo) => {
      const checkWidth = async label => {
        const metrics = await page.evaluate(() => ({
          width: innerWidth, height: innerHeight,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        }));
        expect(metrics.width).toBe(viewport.width);
        expect(metrics.height).toBe(viewport.height);
        expect(metrics.scrollWidth, '本番の無料アプリが横方向にはみ出しています').toBeLessThanOrEqual(metrics.clientWidth + 2);
        await record(testInfo, `無料アプリ本番・${label}`, 'passed', { source: 'live', viewport, ...metrics });
      };

      await openPublic(page, URLS.free);
      expect(await page.evaluate(() => localStorage.getItem('yoru_journal_entries')), '空の専用contextで実行してください').toBeNull();
      await checkWidth('ホーム');
      await enterFreeJournal(page);
      const marker = `live-healthcheck-${Date.now()}-${viewport.width}-${testInfo.retry}`;
      const answers = [1, 2, 3].map(index => `${marker}-q${index}`);
      for (let i = 0; i < answers.length; i++) await page.locator(`#q${i + 1}`).fill(answers[i]);
      await checkWidth('入力画面');

      for (const [label, selector] of [
        ['Q3外側', '#q3'], ['保存欄外側', '.save-note'], ['最下部外側', '.opt-out-bottom'],
      ]) {
        const target = page.locator(selector);
        await target.scrollIntoViewIfNeeded();
        await expect(target).toBeVisible();
        const metrics = await target.evaluate(element => {
          const rect = element.getBoundingClientRect();
          return {
            x: 4, y: Math.max(2, Math.min(innerHeight - 3, Math.floor(rect.top + rect.height / 2))),
            scrollY: Math.round(scrollY), bodyHeight: Math.round(document.body.getBoundingClientRect().height),
            documentHeight: document.documentElement.scrollHeight,
          };
        });
        const image = await page.screenshot({ type: 'png', animations: 'disabled' });
        const rgb = pngPixel(image, metrics.x, metrics.y);
        expect(rgb, '本番表示のRGBを取得できません').toHaveLength(3);
        expect(rgb.every(value => value < 90), `${label}が濃色背景ではありません。再発もCI失敗にします`).toBe(true);
        expect(metrics.bodyHeight, '背景を持つ本文が本番の文書全体を覆っていません').toBeGreaterThanOrEqual(metrics.documentHeight - 2);
        await record(testInfo, `無料アプリ本番・${label}`, 'passed', { source: 'live', viewport, rgb, ...metrics });
        if (label === '最下部外側') {
          expect(metrics.scrollY, '下部へのスクロールを確認できません').toBeGreaterThan(0);
        }
      }
      await checkWidth('最下部');
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
      await checkWidth('再読込後の記録詳細');
      await record(testInfo, '無料アプリ本番・3回答の保存と再読込', 'passed', {
        source: 'live', viewport, answersVerified: 3, entries: 1, syntheticDataOnly: true,
      });

      // 個人記録を取り込まない空contextはfixtureの終了時に破棄する。
    });
  });
}
