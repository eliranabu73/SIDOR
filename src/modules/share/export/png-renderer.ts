// satori + @resvg/resvg-js are ESM-only — imported dynamically (module:NodeNext preserves import()).
import { buildScheduleTemplate } from './templates/satori-template';
import type { ExportStyle, ScheduleExportData } from './types';

// Heebo (Hebrew) Regular + Bold from Google Fonts static CDN.
// satori needs raw TTF/OTF Buffers — we fetch & cache at module init.
// Heebo static TTFs from Google Fonts (gstatic CDN). Static instances are
// required — satori's opentype.js cannot parse variable-font TTFs.
const FONT_URLS = {
  regular:
    'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1EiSyccg.ttf',
  bold:
    'https://fonts.gstatic.com/s/heebo/v28/NGSpv5_NC0k9P_v6ZUCbLRAHxK1Ebiuccg.ttf',
} as const;

interface LoadedFont {
  data: ArrayBuffer;
  weight: 400 | 700;
}

let fontCache: LoadedFont[] | null = null;
let fontCachePromise: Promise<LoadedFont[]> | null = null;

function looksLikeFontBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 64) return false;
  const u = new Uint8Array(buf, 0, 4);
  // TTF/OTF magic: 00 01 00 00, OTTO, true, typ1, wOFF, wOF2
  const sig = String.fromCharCode(u[0]!, u[1]!, u[2]!, u[3]!);
  if (sig === 'OTTO' || sig === 'true' || sig === 'typ1') return true;
  if (sig === 'wOFF' || sig === 'wOF2') return true;
  if (u[0] === 0x00 && u[1] === 0x01 && u[2] === 0x00 && u[3] === 0x00) return true;
  return false;
}

async function fetchFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const r = await fetch(url, {
      headers: {
        // Google Fonts gates static TTF behind a UA — pretend to be a browser.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        accept: 'font/ttf,*/*',
      },
    });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    if (!looksLikeFontBuffer(buf)) return null;
    return buf;
  } catch {
    return null;
  }
}

async function loadFonts(): Promise<LoadedFont[]> {
  if (fontCache) return fontCache;
  if (fontCachePromise) return fontCachePromise;
  fontCachePromise = (async () => {
    const [reg, bold] = await Promise.all([
      fetchFont(FONT_URLS.regular),
      fetchFont(FONT_URLS.bold),
    ]);
    const loaded: LoadedFont[] = [];
    if (reg) loaded.push({ data: reg, weight: 400 });
    if (bold) loaded.push({ data: bold, weight: 700 });
    if (loaded.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        '[export] Heebo font unavailable; falling back to satori default (Hebrew shaping degraded)',
      );
    }
    fontCache = loaded;
    fontCachePromise = null;
    return loaded;
  })();
  return fontCachePromise;
}

export async function renderPng(
  data: ScheduleExportData,
  style: ExportStyle,
): Promise<Buffer> {
  const fonts = await loadFonts();
  const element = buildScheduleTemplate(data, style);
  // module:NodeNext preserves import() natively — no Function() wrapper needed.
  // (The wrapper was invisible to nft and caused "Cannot find package" in prod.)
  const { default: satori } = await import('satori');
  const { Resvg } = await import('@resvg/resvg-js');
  const svg = await satori(element, {
    width: 1200,
    height: 675,
    fonts: fonts.map((f) => ({
      name: 'Heebo',
      data: f.data,
      weight: f.weight,
      style: 'normal',
    })),
  });
  const resvg = new Resvg(svg, { background: 'white', fitTo: { mode: 'width', value: 1200 } });
  const pngData = resvg.render().asPng();
  return Buffer.from(pngData);
}
