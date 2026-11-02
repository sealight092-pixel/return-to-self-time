import { inflateSync } from 'node:zlib';

// Chromeの通常PNGスクリーンショット（8bit RGB/RGBA）のピクセルをメモリ内だけで読む。
// スクリーンショットをディスクやartifactへ保存しない。
export function pngPixel(png, x, y) {
  const signature = '89504e470d0a1a0a';
  if (png.subarray(0, 8).toString('hex') !== signature) throw new Error('PNG形式ではありません');
  let width, height, depth, color, interlace;
  const chunks = [];
  for (let pos = 8; pos + 12 <= png.length;) {
    const size = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const body = png.subarray(pos + 8, pos + 8 + size);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]; color = body[9]; interlace = body[12];
    }
    if (type === 'IDAT') chunks.push(body);
    pos += size + 12;
  }
  const channels = color === 6 ? 4 : color === 2 ? 3 : 0;
  if (depth !== 8 || !channels || interlace !== 0 || x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error('対応外のPNG形式または座標です');
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  let previous = Buffer.alloc(stride);
  for (let row = 0; row <= y; row++) {
    const offset = row * (stride + 1);
    const filter = raw[offset];
    const current = Buffer.from(raw.subarray(offset + 1, offset + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? current[i - channels] : 0;
      const up = previous[i];
      const upperLeft = i >= channels ? previous[i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - upperLeft);
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      } else if (filter !== 0) throw new Error('対応外のPNGフィルターです');
      current[i] = (current[i] + predictor) & 255;
    }
    previous = current;
  }
  return [...previous.subarray(x * channels, x * channels + 3)];
}

export function classifyFreeBackground({ rgb }) {
  return Array.isArray(rgb) && rgb.length === 3 && rgb.every(value => Number.isFinite(value) && value >= 0 && value < 90)
    ? 'passed' : 'failed';
}

export function firstPlaybackSeconds(text) {
  const matches = String(text).match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) ?? [];
  if (!matches.length) return null;
  return matches[0].split(':').reduce((value, part) => value * 60 + Number(part), 0);
}

export function exactClockSeconds(text) {
  const value = String(text ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return null;
  return value.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
}

export function playbackProgress(state, seconds, now) {
  if (seconds === null || !Number.isFinite(seconds)) throw new Error('現在の再生位置を取得できません');
  const elapsedMs = now - state.startedAt;
  if (seconds < state.lastSeconds) throw new Error('現在位置の観測値が逆行しました');
  if (seconds - state.startSeconds > elapsedMs / 1000 + 2) {
    throw new Error('現在位置が実経過時間を超えて飛びました。総時間の誤認は成功扱いにしません');
  }
  if (seconds - state.lastSeconds > (now - state.lastObservedAt) / 1000 + 2) {
    throw new Error('現在位置の観測元が切り替わった可能性があります');
  }
  const increases = state.increases + (seconds > state.lastSeconds ? 1 : 0);
  return { ...state, lastSeconds: seconds, lastObservedAt: now, increases,
    complete: elapsedMs >= 5000 && seconds - state.startSeconds >= 5 && increases >= 3 };
}
