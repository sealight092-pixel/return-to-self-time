import { expect } from '@playwright/test';
import { pngPixel, classifyFreeBackground, firstPlaybackSeconds } from './algorithms.mjs';

export const URLS = Object.freeze({
  sogetsu: 'https://so-getsu.com/',
  sogetsuContact: 'https://so-getsu.com/inquiry/',
  sealight: 'https://sealightwellnesscenter.jp/',
  sealightContact: 'https://sealightwellnesscenter.jp/contact/',
  free: 'https://sogetsucounseling-droid.github.io/emotion-app/',
  paid: 'https://sealight092-pixel.github.io/return-to-self-time/',
});

export async function record(testInfo, check, status, details = {}) {
  await testInfo.attach('health-check', {
    body: Buffer.from(JSON.stringify({ check, status, details })),
    contentType: 'application/json',
  });
}

export async function openPublic(page, url) {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  expect(response, '公開ページのHTTP応答がありません').not.toBeNull();
  expect(response.status(), '公開ページのHTTPエラー').toBeLessThan(400);
  const actual = new URL(page.url());
  const expected = new URL(url);
  expect(actual.protocol, 'HTTPS以外へ転送されました').toBe('https:');
  expect([expected.hostname, `www.${expected.hostname}`], '異なるサイトへの転送').toContain(actual.hostname);
}

export async function mobileMeasure(page, testInfo, label) {
  const metric = await page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  await record(testInfo, label, 'measured', metric);
  expect(metric.viewport.width, 'スマホ幅を適用できません').toBe(390);
  expect(metric.viewport.height).toBe(844);
  expect(metric.scrollWidth, '横方向にはみ出しています').toBeLessThanOrEqual(metric.clientWidth + 2);
}

export async function enterFreeJournal(page) {
  await page.getByRole('button', { name: 'はじめる', exact: true }).click();
  await page.getByRole('button', { name: '次へ', exact: true }).click();
  await page.getByRole('button', { name: '気持ちを書いてみる', exact: true }).click();
  await expect(page.locator('#q1')).toBeVisible();
}

export async function enterPaid(page) {
  const skip = page.locator('#btn-skip-breathing');
  await skip.waitFor({ state: 'visible', timeout: 12_000 });
  await skip.click();
  await expect(page.locator('body')).not.toHaveClass(/onboarding-active/);
  await expect(page.locator('.nav-btn[data-page="journal"]')).toBeVisible();
}

export async function checkFreeBackground(page, testInfo) {
  const note = page.locator('.save-note');
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeVisible();
  const metrics = await note.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const bodyRect = document.body.getBoundingClientRect();
    const css = getComputedStyle(document.body);
    const card = getComputedStyle(document.querySelector('.question-card'));
    const rgb = card.backgroundColor.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
    return {
      x: 4, y: Math.max(2, Math.min(innerHeight - 3, Math.floor(rect.top + rect.height / 2))),
      belowBody: rect.top + rect.height / 2 > bodyRect.bottom,
      noRepeat: css.backgroundRepeat === 'no-repeat',
      hasGradient: css.backgroundImage.includes('linear-gradient'),
      cardDark: rgb.length === 3 && rgb.every(value => value < 90),
      bodyHeight: Math.round(bodyRect.height), documentHeight: document.documentElement.scrollHeight,
    };
  });
  const screenshot = await page.screenshot({ type: 'png', animations: 'disabled' });
  const rgb = pngPixel(screenshot, metrics.x, metrics.y);
  const status = classifyFreeBackground({ ...metrics, rgb });
  await record(testInfo, '無料アプリ・最下部背景', status, { ...metrics, rgb,
    issue: status === 'known_issue' ? '確認済み：画面高を超えた余白が白くなる' : undefined });
  expect(status, '確認済みの白背景症状以外の表示異常です').not.toBe('failed');
}

async function visibleClock(frame) {
  // 画面に表示された時刻とARIA値だけを読み、本文や会員情報をログへ出さない。
  return frame.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && css.visibility !== 'hidden' && css.display !== 'none';
    };
    const specific = [...document.querySelectorAll('.ytp-time-current,[class*="current-time"],[role="slider"]')]
      .filter(visible).map(element => element.getAttribute('aria-valuetext') || element.innerText || element.getAttribute('aria-label') || '');
    const texts = [...specific, document.body.innerText];
    for (const text of texts) {
      const match = text.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
      if (match) return match[0];
    }
    return null;
  });
}

async function clickDriveControl(frame, kind) {
  const names = kind === 'play' ? /^(再生|Play|Play audio|音声を再生)$/i : /^(一時停止|Pause|Pause audio|音声を一時停止)$/i;
  let candidate;
  await expect.poll(async () => {
    for (const role of ['checkbox', 'button']) {
      const controls = frame.getByRole(role, { name: names });
      for (let i = 0; i < await controls.count(); i++) {
        const control = controls.nth(i);
        if (await control.isVisible()) { candidate = control; return true; }
      }
    }
    return false;
  }, { timeout: 25_000, message: `Google Driveの${kind}操作が見つかりません（認証要求は回避しません）` }).toBe(true);
  await candidate.click();
}

export async function checkAudio(page, testInfo, category, title) {
  await page.locator(`.nav-btn[data-page="${category}"]`).click();
  const target = page.locator(`#page-${category} .content-card`).filter({ has: page.locator('.card-title', { hasText: title }) });
  await expect(target).toHaveCount(1);
  await target.locator('.card-play-btn').click();
  const player = page.locator('#audio-player');
  const iframe = page.locator('#audio-frame');
  await expect(player).toBeVisible();
  await expect(iframe).toHaveAttribute('src', /^https:\/\/drive\.google\.com\/file\/d\/[^/]+\/preview$/);
  const playerRect = await player.boundingBox();
  expect(playerRect.x).toBeGreaterThanOrEqual(-2);
  expect(playerRect.x + playerRect.width).toBeLessThanOrEqual(392);
  expect(playerRect.y, '音声操作部が画面上にはみ出しています').toBeGreaterThanOrEqual(-2);
  expect(playerRect.y + playerRect.height, '音声操作部が画面下にはみ出しています').toBeLessThanOrEqual(846);
  await mobileMeasure(page, testInfo, `有料アプリ・${category}プレーヤー`);
  const frame = await (await iframe.elementHandle()).contentFrame();
  expect(frame, 'Google Drive埋込フレームがありません').not.toBeNull();
  let start;
  await expect.poll(async () => {
    start = firstPlaybackSeconds(await visibleClock(frame));
    return start;
  }, { timeout: 25_000, message: '音声の可視時刻が読み込まれません（認証は回避しません）' }).not.toBeNull();
  expect(start, '音声の表示時刻を検証できません').not.toBeNull();
  await clickDriveControl(frame, 'play');
  let lastSeconds = start;
  await expect.poll(async () => {
    await expect(player, '再生中にプレーヤーが消えました').toBeVisible({ timeout: 1_000 });
    expect(await iframe.evaluate(element => element.isConnected), '再生フレームが切断されました').toBe(true);
    const seconds = firstPlaybackSeconds(await visibleClock(frame));
    if (seconds !== null) lastSeconds = seconds;
    return lastSeconds - start;
  }, { timeout: 25_000, intervals: [1_000], message: '表示時刻が5秒以上進みません' }).toBeGreaterThanOrEqual(5);
  await clickDriveControl(frame, 'pause');
  // 一時停止ボタンが再生へ戻ったことと、複数回の表示時刻で停止を確認。
  await expect.poll(async () => {
    const controls = frame.getByRole('checkbox', { name: /^(再生|Play)$/i }).or(frame.getByRole('button', { name: /^(再生|Play)$/i }));
    return await controls.count();
  }, { timeout: 8_000 }).toBeGreaterThan(0);
  const pauseSeconds = firstPlaybackSeconds(await visibleClock(frame));
  expect(pauseSeconds).not.toBeNull();
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1_000);
    await expect(player).toBeVisible();
    const now = firstPlaybackSeconds(await visibleClock(frame));
    expect(now, '一時停止後も表示時刻が進んでいます').toBe(pauseSeconds);
  }
  await record(testInfo, `有料音声・${category}`, 'passed', { title, startSeconds: start, progressedToSeconds: lastSeconds, pausedAtSeconds: pauseSeconds });
  await page.locator('#audio-close').click();
  await expect(player).toBeHidden();
}
