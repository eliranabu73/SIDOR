#!/usr/bin/env node
// Generate iOS PWA splash screens (apple-touch-startup-image) as PNGs.
// Pure-Node PNG encoder — no external deps. Adapted from gen-icons.mjs.
//
// Each splash:
// - Vertical brand gradient: indigo-500 (#6366F1) → slate-950 (#0F172A)
// - Centered scheduler-glyph badge (3x3 grid) on rounded-rect plate
// - "סידור4S" wordmark rendered as simple vector glyphs below
//
// Since Apple's startup-image is shown briefly before paint, a clean
// solid/gradient + logo is sufficient and matches the dark status bar.

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "splash");
mkdirSync(outDir, { recursive: true });

// Vertical gradient stops (top → bottom)
const TOP = { r: 0x63, g: 0x66, b: 0xf1 }; // indigo-500
const MID = { r: 0x4f, g: 0x46, b: 0xe5 }; // indigo-600
const BOT = { r: 0x0f, g: 0x17, b: 0x2a }; // slate-950

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function sampleGradient(t) {
  if (t <= 0.45) {
    const k = t / 0.45;
    return {
      r: lerp(TOP.r, MID.r, k),
      g: lerp(TOP.g, MID.g, k),
      b: lerp(TOP.b, MID.b, k),
    };
  }
  const k = (t - 0.45) / 0.55;
  return {
    r: lerp(MID.r, BOT.r, k),
    g: lerp(MID.g, BOT.g, k),
    b: lerp(MID.b, BOT.b, k),
  };
}

// ---- PNG encoder (CRC32 + chunks) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Drawing helpers ----
function setPx(pixels, w, h, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  const inv = (255 - a) / 255;
  pixels[i] = Math.round(pixels[i] * inv + r * (a / 255));
  pixels[i + 1] = Math.round(pixels[i + 1] * inv + g * (a / 255));
  pixels[i + 2] = Math.round(pixels[i + 2] * inv + b * (a / 255));
  pixels[i + 3] = 255;
}
function fillRoundedRect(pixels, w, h, x0, y0, rw, rh, radius, color, alpha = 255) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const dx = x < x0 + radius ? x0 + radius - x : x >= x0 + rw - radius ? x - (x0 + rw - radius - 1) : 0;
      const dy = y < y0 + radius ? y0 + radius - y : y >= y0 + rh - radius ? y - (y0 + rh - radius - 1) : 0;
      let a = alpha;
      if (dx > 0 && dy > 0) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        if (d > radius - 1) a = Math.round((radius - d) * alpha);
      }
      setPx(pixels, w, h, x, y, color.r, color.g, color.b, a);
    }
  }
}
function fillRect(pixels, w, h, x0, y0, rw, rh, color, alpha = 255) {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      setPx(pixels, w, h, x, y, color.r, color.g, color.b, alpha);
    }
  }
}

// 5x7 pixel font for the wordmark "סידור4S" — Hebrew is complex, so we
// render the safe Latin variant "sidor4S" which works fine for splash polish.
// Each glyph = 5 wide × 7 tall; '#' = on, '.' = off.
const FONT = {
  s: ["..###", "#....", "#....", ".###.", "....#", "....#", "###.."],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  d: ["....#", "....#", "....#", ".####", "#...#", "#...#", ".####"],
  o: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  r: ["#.##.", "##..#", "#....", "#....", "#....", "#....", "#...."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  "4S": null,
};

function drawGlyph(pixels, w, h, glyph, x, y, scale, color, alpha) {
  const rows = FONT[glyph];
  if (!rows) return;
  for (let gy = 0; gy < 7; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      if (rows[gy][gx] === "#") {
        fillRect(pixels, w, h, x + gx * scale, y + gy * scale, scale, scale, color, alpha);
      }
    }
  }
}
function drawText(pixels, w, h, text, cx, cy, scale, color, alpha = 255) {
  const glyphW = 5 * scale;
  const space = scale;
  const totalW = text.length * glyphW + (text.length - 1) * space;
  let x = Math.round(cx - totalW / 2);
  const y = Math.round(cy - (7 * scale) / 2);
  for (const ch of text) {
    drawGlyph(pixels, w, h, ch, x, y, scale, color, alpha);
    x += glyphW + space;
  }
}

// Scheduler-glyph badge: rounded plate + 3x3 grid (same vibe as app icon)
function drawBadge(pixels, w, h, cx, cy, size) {
  const plateRadius = Math.round(size * 0.22);
  const plate = { r: 255, g: 255, b: 255 };
  fillRoundedRect(
    pixels,
    w,
    h,
    Math.round(cx - size / 2),
    Math.round(cy - size / 2),
    size,
    size,
    plateRadius,
    plate,
    245
  );
  // 3x3 grid bars
  const cellSize = Math.round(size * 0.18);
  const gap = Math.round(size * 0.04);
  const gridW = cellSize * 3 + gap * 2;
  const startX = Math.round(cx - gridW / 2);
  const startY = Math.round(cy - gridW / 2);
  const bar = { r: 0x4f, g: 0x46, b: 0xe5 }; // indigo-600
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const filled = !(row === 0 || (row === 2 && col === 1));
      const alpha = filled ? 235 : 110;
      const cellH = Math.round(cellSize * 0.45);
      const rx = startX + col * (cellSize + gap);
      const ry = startY + row * (cellSize + gap) + Math.round((cellSize - cellH) / 2);
      fillRect(pixels, w, h, rx, ry, cellSize, cellH, bar, alpha);
    }
  }
}

function makeSplash(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  // Vertical gradient background
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const c = sampleGradient(t);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      pixels[i] = c.r;
      pixels[i + 1] = c.g;
      pixels[i + 2] = c.b;
      pixels[i + 3] = 255;
    }
  }

  // Centered badge — size scales with shorter dimension
  const short = Math.min(width, height);
  const badgeSize = Math.round(short * 0.32);
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2 - badgeSize * 0.15);
  drawBadge(pixels, width, height, cx, cy, badgeSize);

  // Wordmark below the badge
  const scale = Math.max(2, Math.round(short / 220));
  const textY = cy + Math.round(badgeSize * 0.75) + scale * 6;
  drawText(pixels, width, height, "sidor4S", cx, textY, scale, { r: 255, g: 255, b: 255 }, 230);

  return encodePNG(width, height, pixels);
}

const TARGETS = [
  { w: 1290, h: 2796 }, // iPhone 14 Pro Max
  { w: 1179, h: 2556 }, // iPhone 14 Pro
  { w: 1284, h: 2778 }, // iPhone 14 Plus
  { w: 1170, h: 2532 }, // iPhone 13/14
  { w: 1080, h: 2340 }, // iPhone 13 mini
  { w: 828, h: 1792 },  // iPhone 11 / XR
  { w: 750, h: 1334 },  // iPhone SE 2/3
  { w: 2048, h: 2732 }, // iPad Pro 12.9"
  // Apple-touch-icon: same brand square at 180×180
];

for (const { w, h } of TARGETS) {
  const png = makeSplash(w, h);
  const file = join(outDir, `iphone-${w}x${h}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${(png.length / 1024).toFixed(1)} KB)`);
}

// Also emit apple-touch-icon.png (180×180) using the badge on gradient
{
  const size = 180;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const c = sampleGradient(t);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      pixels[i] = c.r;
      pixels[i + 1] = c.g;
      pixels[i + 2] = c.b;
      pixels[i + 3] = 255;
    }
  }
  drawBadge(pixels, size, size, size / 2, size / 2, Math.round(size * 0.62));
  const png = encodePNG(size, size, pixels);
  const file = join(__dirname, "..", "public", "apple-touch-icon.png");
  writeFileSync(file, png);
  console.log(`wrote ${file} (${(png.length / 1024).toFixed(1)} KB)`);
}
