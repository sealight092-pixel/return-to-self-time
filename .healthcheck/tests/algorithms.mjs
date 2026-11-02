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

export function classifyFreeBackground({ rgb, belowBody, noRepeat, hasGradient, cardDark }) {
  if (rgb.every(value => value < 90)) return 'passed';
  if (rgb.every(value => value >= 245) && belowBody && noRepeat && hasGradient && cardDark) return 'known_issue';
  return 'failed';
}

export function firstPlaybackSeconds(text) {
  const matches = String(text).match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) ?? [];
  if (!matches.length) return null;
  return matches[0].split(':').reduce((value, part) => value * 60 + Number(part), 0);
}

