import { expect } from '@playwright/test';
import { pngPixel, classifyFreeBackground, exactClockSeconds, playbackProgress } from './algorithms.mjs';

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
  await record(testInfo, '無料アプリ・最下部背景', status, { ...metrics, rgb });
  expect(status, '無料アプリの最下部が濃色背景を維持していません').toBe('passed');
}

async function captureCurrentClock(frame) {
  // 現在位置のDOM要素を一度だけ捕まえ、再生・停止で同じ要素を読み続ける。
  // body全体の「最初の時刻」を毎回選び直すと総時間への取り違えが起こるため行わない。
  return frame.evaluateHandle(() => {
    if (!document.body) return null;
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && css.visibility !== 'hidden' && css.display !== 'none';
    };
    const clean = text => String(text ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    const readText = node => clean(node.innerText ?? node.textContent);
    const clock = /^\d{1,2}:\d{2}(?::\d{2})?$/;
    for (const node of document.querySelectorAll('.ytp-time-current,[class*="current-time"]')) {
      if (visible(node) && clock.test(readText(node))) {
        return { node, kind: 'current-time-class' };
      }
    }
    // Google Driveのgenericな「0:00」「8:10」の組は、最小の時刻表示領域を特定し、
    // その第一要素（現在位置）だけを固定する。総時間は別ノードとして確認する。
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = clean(walker.currentNode.textContent);
      const node = walker.currentNode.parentElement;
      if (clock.test(text) && node && visible(node) && clock.test(readText(node)) && !nodes.includes(node)) nodes.push(node);
    }
    const toSeconds = text => text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
    for (const node of nodes) {
      let region = node.parentElement;
      for (let depth = 0; region && depth < 4; depth++, region = region.parentElement) {
        const pair = nodes.filter(candidate => region.contains(candidate));
        if (pair.length !== 2 || pair[0] !== node) continue;
        const currentText = readText(pair[0]), durationText = readText(pair[1]);
        const remainder = readText(region).replace(currentText, '').replace(durationText, '').trim();
        if (!['', '/', '／', 'of'].includes(remainder)) continue;
        if (toSeconds(currentText) > toSeconds(durationText)) continue;
        return { node: pair[0], durationNode: pair[1], kind: 'current-duration-pair' };
      }
    }
    return null;
  });
}

async function readCurrentClock(observer) {
  const observation = await observer.evaluate(state => {
    const node = state.node;
    const rect = node.getBoundingClientRect();
    const css = getComputedStyle(node);
    return { connected: node.isConnected, visible: rect.width > 0 && rect.height > 0 && css.display !== 'none' && css.visibility !== 'hidden',
      text: node.innerText ?? node.textContent, kind: state.kind };
  });
  expect(observation.connected, '固定した現在位置の要素が外れました').toBe(true);
  expect(observation.visible, '固定した現在位置が見えなくなりました').toBe(true);
  const seconds = exactClockSeconds(observation.text);
  expect(seconds, '現在位置の表示を時刻として検証できません').not.toBeNull();
  return { seconds, kind: observation.kind };
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
  const previewUrl = await iframe.getAttribute('src');
  // contentFrame()はabout:blank段階でも返る。正式なpreview文書の準備を待つ。
  await frame.waitForURL(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 });
  let observer;
  await expect.poll(async () => {
    try {
      const candidate = await captureCurrentClock(frame);
      if (await candidate.evaluate(value => value !== null)) { observer = candidate; return true; }
      await candidate.dispose();
      return false;
    } catch (error) {
      const contextDestroyed = value => /Execution context (?:was )?destroyed/.test(String(value?.message ?? value));
      if (!contextDestroyed(error)) throw error;
      let documentReady;
      try {
        documentReady = await frame.evaluate(expectedUrl =>
          location.href === expectedUrl && document.readyState !== 'loading' && Boolean(document.body), previewUrl);
      } catch (readyError) {
        if (!contextDestroyed(readyError)) throw readyError;
        documentReady = false;
      }
      // 初期ナビゲーション中だけ再観測する。準備後・observer確定後の消失は失敗のまま。
      if (documentReady) throw error;
      await frame.waitForURL(previewUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 });
      return false;
    }
  }, { timeout: 25_000, message: '現在位置と総時間を区別できません（認証は回避しません）' }).toBe(true);
  const initial = await readCurrentClock(observer);
  const start = initial.seconds;
  await clickDriveControl(frame, 'play');
  const startedAt = performance.now();
  let progress = { startSeconds: start, startedAt, lastSeconds: start, lastObservedAt: startedAt, increases: 0, complete: false };
  await expect.poll(async () => {
    await expect(player, '再生中にプレーヤーが消えました').toBeVisible({ timeout: 1_000 });
    expect(await iframe.evaluate(element => element.isConnected), '再生フレームが切断されました').toBe(true);
    const { seconds } = await readCurrentClock(observer);
    progress = playbackProgress(progress, seconds, performance.now());
    return progress.complete;
  }, { timeout: 25_000, intervals: [1_000], message: '5秒の実経過と3回以上の段階的な再生位置の増加を確認できません' }).toBe(true);
  await clickDriveControl(frame, 'pause');
  // 一時停止ボタンが再生へ戻ったことと、複数回の表示時刻で停止を確認。
  await expect.poll(async () => {
    const controls = frame.getByRole('checkbox', { name: /^(再生|Play)$/i }).or(frame.getByRole('button', { name: /^(再生|Play)$/i }));
    return await controls.count();
  }, { timeout: 8_000 }).toBeGreaterThan(0);
  const pauseSeconds = (await readCurrentClock(observer)).seconds;
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1_000);
    await expect(player).toBeVisible();
    const now = (await readCurrentClock(observer)).seconds;
    expect(now, '一時停止後も表示時刻が進んでいます').toBe(pauseSeconds);
  }
  await record(testInfo, `有料音声・${category}`, 'passed', { title, clockSource: initial.kind, startSeconds: start,
    progressedToSeconds: progress.lastSeconds, elapsedMs: Math.round(performance.now() - startedAt), increases: progress.increases, pausedAtSeconds: pauseSeconds });
  await observer.dispose();
  await page.locator('#audio-close').click();
  await expect(player).toBeHidden();
}
