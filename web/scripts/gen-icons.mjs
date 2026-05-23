#!/usr/bin/env node
// Generate PWA icons as solid brand-color PNGs (no external deps).
// Produces a gradient-ish indigo→violet→cyan square using a pure Node PNG encoder.
// For higher-fidelity icons (rendering the SVG logo), install `sharp` and replace this.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public");

// Brand gradient stops (top-left → bottom-right):
const STOPS = [
  { r: 0x63, g: 0x66, b: 0xf1 }, // indigo-500
  { r: 0x7c, g: 0x5c, b: 0xf5 }, // violet
  { r: 0x22, g: 0xd3, b: 0xee }, // cyan-400
];

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function sampleGradient(t) {
  // t in [0,1], 3-stop linear
  if (t <= 0.5) {
    const k = t / 0.5;
    return {
      r: lerp(STOPS[0].r, STOPS[1].r, k),
      g: lerp(STOPS[0].g, STOPS[1].g, k),
      b: lerp(STOPS[0].b, STOPS[1].b, k),
    };
  } else {
    const k = (t - 0.5) / 0.5;
    return {
      r: lerp(STOPS[1].r, STOPS[2].r, k),
      g: lerp(STOPS[1].g, STOPS[2].g, k),
      b: lerp(STOPS[1].b, STOPS[2].b, k),
    };
  }
}

// CRC-32 table
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

function encodePNG(width, height, pixels /* RGBA Buffer */) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Add filter byte (0) per scanline
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  // For maskable: full bleed gradient (safe zone = inner 80%)
  // For regular: rounded corners (transparent outside)
  const radius = maskable ? 0 : Math.round(size * 0.22);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = (x + y) / (2 * (size - 1)); // diagonal gradient
      const c = sampleGradient(t);

      let alpha = 255;
      if (!maskable) {
        // rounded-rect mask
        const dx = x < radius ? radius - x : x >= size - radius ? x - (size - radius - 1) : 0;
        const dy = y < radius ? radius - y : y >= size - radius ? y - (size - radius - 1) : 0;
        if (dx > 0 && dy > 0) {
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > radius) alpha = 0;
          else if (d > radius - 1) alpha = Math.round((radius - d) * 255);
        }
      }

      pixels[i] = c.r;
      pixels[i + 1] = c.g;
      pixels[i + 2] = c.b;
      pixels[i + 3] = alpha;
    }
  }

  // Draw 3x3 grid of white rounded rectangles (scheduler glyph)
  const cellSize = Math.round(size * 0.18);
  const gap = Math.round(size * 0.04);
  const gridW = cellSize * 3 + gap * 2;
  const startX = Math.round((size - gridW) / 2);
  const startY = Math.round((size - gridW) / 2);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const filled = !(row === 0 || (row === 2 && col === 1));
      const cellAlpha = filled ? 240 : 110;
      const cellH = Math.round(cellSize * 0.45);
      const rx = startX + col * (cellSize + gap);
      const ry = startY + row * (cellSize + gap) + Math.round((cellSize - cellH) / 2);
      for (let y = ry; y < ry + cellH; y++) {
        for (let x = rx; x < rx + cellSize; x++) {
          if (x < 0 || x >= size || y < 0 || y >= size) continue;
          const i = (y * size + x) * 4;
          if (pixels[i + 3] === 0) continue;
          // alpha-blend white over gradient
          const a = cellAlpha / 255;
          pixels[i] = Math.round(pixels[i] * (1 - a) + 255 * a);
          pixels[i + 1] = Math.round(pixels[i + 1] * (1 - a) + 255 * a);
          pixels[i + 2] = Math.round(pixels[i + 2] * (1 - a) + 255 * a);
        }
      }
    }
  }

  return encodePNG(size, size, pixels);
}

const targets = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-512-maskable.png", size: 512, maskable: true },
];

for (const { name, size, maskable } of targets) {
  const png = makeIcon(size, { maskable });
  const path = join(outDir, name);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}
