import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { pngPixel, classifyFreeBackground, firstPlaybackSeconds } from './algorithms.mjs';
import HealthReporter from '../reporter.mjs';

function chunk(type, body) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  // テスト用の最小データ。decoderはCRCを検査しない。
  return Buffer.concat([size, Buffer.from(type), body, Buffer.alloc(4)]);
}

function samplePng(channels, filter) {
  const rows = [Buffer.from([10, 20, 30, ...(channels === 4 ? [255] : []), 40, 50, 60, ...(channels === 4 ? [255] : [])]),
    Buffer.from([70, 80, 90, ...(channels === 4 ? [255] : []), 100, 110, 120, ...(channels === 4 ? [255] : [])])];
  const filtered = rows.map((row, y) => {
    const out = Buffer.alloc(row.length + 1); out[0] = filter;
    for (let i = 0; i < row.length; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = y > 0 ? rows[y - 1][i] : 0;
      const c = y > 0 && i >= channels ? rows[y - 1][i - channels] : 0;
      let p = 0;
      if (filter === 1) p = a;
      if (filter === 2) p = b;
      if (filter === 3) p = Math.floor((a + b) / 2);
      if (filter === 4) {
        const estimate = a + b - c;
        const da = Math.abs(estimate - a), db = Math.abs(estimate - b), dc = Math.abs(estimate - c);
        p = da <= db && da <= dc ? a : db <= dc ? b : c;
      }
      out[i + 1] = (row[i] - p + 256) & 255;
    }
    return out;
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4);
  header[8] = 8; header[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(filtered))), chunk('IEND', Buffer.alloc(0))]);
}

test('ChromeのRGB/RGBA PNGの全フィルターで下部の測定画素を復元する', () => {
  for (const channels of [3, 4]) for (const filter of [0, 1, 2, 3, 4]) {
    const png = samplePng(channels, filter);
    assert.deepEqual(pngPixel(png, 1, 1), [100, 110, 120]);
    assert.deepEqual(pngPixel(png, 0, 0), [10, 20, 30]);
  }
});

test('確認済みの白背景条件が全て一致した時だけknown_issueにする', () => {
  const known = { rgb: [255, 255, 255], belowBody: true, noRepeat: true, hasGradient: true, cardDark: true };
  assert.equal(classifyFreeBackground(known), 'known_issue');
  for (const name of ['belowBody', 'noRepeat', 'hasGradient', 'cardDark']) {
    assert.equal(classifyFreeBackground({ ...known, [name]: false }), 'failed');
  }
  assert.equal(classifyFreeBackground({ ...known, rgb: [130, 200, 250] }), 'failed');
  assert.equal(classifyFreeBackground({ ...known, rgb: [11, 26, 43] }), 'passed');
});

test('再生位置と総時間の並びから現在位置だけを読む', () => {
  assert.equal(firstPlaybackSeconds('0:05 / 8:10'), 5);
  assert.equal(firstPlaybackSeconds('1:02:03 / 2:00:00'), 3723);
  assert.equal(firstPlaybackSeconds('ログインして再生してください'), null);
});

test('reporterは失敗と再試行の成功を両方残し、secretを整形出力しない', () => {
  const reporter = new HealthReporter();
  const testCase = { titlePath: () => ['test'] };
  reporter.onTestEnd(testCase, { retry: 0, status: 'failed', duration: 5,
    attachments: [], errors: [{ message: 'Bearer not-a-real-token https://example.com/?token=fake' }] });
  reporter.onTestEnd(testCase, { retry: 1, status: 'passed', duration: 5, attachments: [], errors: [] });
  assert.equal(reporter.attempts.length, 2);
  assert.equal(reporter.attempts[0].status, 'failed');
  assert.equal(reporter.attempts[1].status, 'passed');
  assert.doesNotMatch(reporter.attempts[0].errors[0], /not-a-real-token|token=fake/);
});
