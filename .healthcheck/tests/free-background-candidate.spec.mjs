// コピー先: 有料repoの .healthcheck/tests/free-background-candidate.spec.mjs
// 公開された無料アプリへの変更は行わず、このtestのdocument応答だけでCSS候補を試す。
import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { URLS, openPublic, enterFreeJournal, record } from './helpers.mjs';
import { pngPixel } from './algorithms.mjs';

const ORIGINAL_CSS_LINES = [
  '    html, body {',
  '      height: 100%;',
  '      background: linear-gradient(180deg, #0b1a2b 0%, #0f1e2e 60%, #111f30 100%);',
];
const CANDIDATE_CSS_LINES = [
  '    html, body {',
  '      /* Keep the background behind long screens, including the save area. */',
  '      min-height: 100vh;',
  '      min-height: 100dvh;',
  '      background: var(--bg) linear-gradient(180deg, #0b1a2b 0%, #0f1e2e 60%, #111f30 100%);',
];
const scripts = html => html.match(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi) ?? [];

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test.describe(`未公開CSS候補 ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, screen: viewport, deviceScaleFactor: 1, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });

    test('下部背景・横幅・3回答の保存と再読込', async ({ page }, testInfo) => {
      let documentsReplaced = 0;
      let sourceScriptsSha256;
      const app = new URL(URLS.free);
      const documentPaths = new Set([app.pathname, app.pathname + 'index.html']);
      await page.route(url => url.origin === app.origin && documentPaths.has(url.pathname), async route => {
        const request = route.request();
        if (request.resourceType() !== 'document' || request.frame() !== page.mainFrame()) {
          await route.continue();
          return;
        }
        const response = await route.fetch();
        expect(response.status(), '候補の元になる公開HTMLの取得失敗').toBe(200);
        const original = await response.text();
        const newline = original.includes('\r\n') ? '\r\n' : '\n';
        const from = ORIGINAL_CSS_LINES.join(newline);
        const to = CANDIDATE_CSS_LINES.join(newline);
        expect(original.split(from).length - 1, '元のCSSはHTML内に正確に1か所必要です').toBe(1);
        expect(original.split(to).length - 1, '公開済み候補を未公開プレビューとして扱いません').toBe(0);
        const candidate = original.replace(from, to);
        expect(candidate.split(to).length - 1, 'CSS候補の置換は1回だけです').toBe(1);
        expect(candidate.replace(to, from), 'CSS以外のHTMLを変更してはいけません').toBe(original);
        const beforeScripts = scripts(original);
        expect(beforeScripts.length, '元HTMLにアプリのJavaScriptが見つかりません').toBeGreaterThan(0);
        expect(scripts(candidate), 'アプリのJavaScriptは元の応答と同一である必要があります').toEqual(beforeScripts);
        const hash = createHash('sha256').update(beforeScripts.join('\n')).digest('hex');
        if (sourceScriptsSha256) expect(hash, '再読込時に元JavaScriptが変わっています').toBe(sourceScriptsSha256);
        sourceScriptsSha256 = hash;
        documentsReplaced++;
        const headers = { ...response.headers(), 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
        delete headers['content-length'];
        delete headers['content-encoding'];
        delete headers.etag;
        delete headers['last-modified'];
        await route.fulfill({ response, headers, body: candidate });
      });

      const measureWidth = async label => {
        const metrics = await page.evaluate(() => ({
          width: innerWidth, height: innerHeight,
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        }));
        expect(metrics.width).toBe(viewport.width);
        expect(metrics.height).toBe(viewport.height);
        expect(metrics.scrollWidth, '候補画面が横方向にはみ出しています').toBeLessThanOrEqual(metrics.clientWidth + 2);
        await record(testInfo, `未公開CSS候補・${label}`, 'passed', { candidatePreview: true, viewport, ...metrics });
      };

      await openPublic(page, URLS.free);
      expect(await page.evaluate(() => localStorage.getItem('yoru_journal_entries')), '各testは空contextで実行してください').toBeNull();
      await measureWidth('ホーム');
      await enterFreeJournal(page);
      const marker = `candidate-preview-${Date.now()}-${viewport.width}-${testInfo.retry}`;
      const answers = [1, 2, 3].map(index => `${marker}-q${index}`);
      for (let i = 0; i < answers.length; i++) await page.locator(`#q${i + 1}`).fill(answers[i]);
      await measureWidth('入力画面');

      let previewScreenshot;
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
        expect(rgb, 'RGBを3成分取得できません').toHaveLength(3);
        expect(rgb.every(value => value < 90), `${label}が濃色背景ではありません。既知問題として除外しません`).toBe(true);
        expect(metrics.bodyHeight, '背景を持つ本文が文書全体を覆っていません').toBeGreaterThanOrEqual(metrics.documentHeight - 2);
        await record(testInfo, `未公開CSS候補・${label}`, 'passed', { candidatePreview: true, viewport, rgb, ...metrics });
        if (label === '最下部外側') {
          expect(metrics.scrollY, '下部へのスクロールを実行できていません').toBeGreaterThan(0);
          previewScreenshot = image;
        }
      }
      await measureWidth('最下部');
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
      expect(documentsReplaced, '初回と再読込の両documentに候補CSSを適用する必要があります').toBe(2);
      await record(testInfo, '未公開CSS候補・保存と再読込', 'passed', {
        candidatePreview: true, viewport, answersVerified: 3, documentsReplaced,
        cssReplacementsPerDocument: 1, javascriptUnchanged: true, sourceScriptsSha256,
        publicSiteModified: false, syntheticDataOnly: true,
      });
      // 画像は合格した390pxケースの1枚だけ。未公開候補の表示であり本番反映の証拠ではない。
      if (viewport.width === 390) {
        process.stdout.write('BACKGROUND_FIX_PREVIEW_METADATA=' + JSON.stringify({
          candidatePreview: true, published: false, contentType: 'image/png', viewport,
          description: '無料アプリ・未公開CSS修正候補の下部プレビュー。ブラウザ内の応答だけを置換。',
        }) + '\n');
        process.stdout.write('BACKGROUND_FIX_PREVIEW_SCREENSHOT_BASE64=' + previewScreenshot.toString('base64') + '\n');
      }
    });
  });
}
