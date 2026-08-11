/**
 * Generates the PWA icon set.
 *
 * Committing binary PNGs to a repo makes them invisible to review, so the icons
 * are generated instead: a wine-dark square with the champagne M, drawn from a
 * bitmap so there is no font dependency at build time.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/icons');

const BG = [0x2e, 0x16, 0x1f]; // --wine-dark
const FG = [0xd8, 0xc3, 0x9a]; // --champagne

// A 9x9 "M". Wide serif stems with the centre V, legible down to 32px.
const GLYPH = [
  '1.......1',
  '11.....11',
  '1.1...1.1',
  '1.1...1.1',
  '1..1.1..1',
  '1..1.1..1',
  '1...1...1',
  '1.......1',
  '1.......1',
].map((row) => row.split('').map((cell) => cell === '1'));

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, { maskable }) {
  const raw = Buffer.alloc(size * (size * 4 + 1));

  // Maskable icons are cropped to a circle by the launcher, so the glyph gets
  // more padding there than in the standard icon.
  const inset = maskable ? 0.3 : 0.22;
  const glyphSize = Math.round(size * (1 - inset * 2));
  const cell = glyphSize / 9;
  const originX = (size - glyphSize) / 2;
  const originY = (size - glyphSize) / 2;
  const radius = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none

    for (let x = 0; x < size; x += 1) {
      const offset = rowStart + 1 + x * 4;

      const gx = Math.floor((x - originX) / cell);
      const gy = Math.floor((y - originY) / cell);
      const onGlyph = gy >= 0 && gy < 9 && gx >= 0 && gx < 9 && GLYPH[gy][gx];
      const colour = onGlyph ? FG : BG;

      raw[offset] = colour[0];
      raw[offset + 1] = colour[1];
      raw[offset + 2] = colour[2];
      raw[offset + 3] = radius > 0 && outsideRoundedSquare(x, y, size, radius) ? 0 : 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function outsideRoundedSquare(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy > radius * radius;
}

mkdirSync(OUT, { recursive: true });

const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
  ['favicon-32.png', 32, { maskable: true }],
];

for (const [name, size, options] of targets) {
  writeFileSync(resolve(OUT, name), png(size, options));
  process.stdout.write(`wrote public/icons/${name} (${size}px)\n`);
}
