/**
 * WhatsApp image-sharing utility for sidor4S schedule exports.
 *
 * Strategies, in order of preference:
 *  1. native_share        — Web Share API Level 2 (`navigator.share` w/ files).
 *                           One-tap on mobile: image goes straight into WA picker.
 *  2. wa_with_url         — Paste a public crawlable PNG URL into wa.me. WhatsApp
 *                           Web/desktop renders an image preview automatically.
 *  3. download_fallback   — Download the PNG to disk + open wa.me with text.
 *                           User then drags the file into the chat manually.
 */

import {
  exportAuthHeaders,
  getScheduleExportUrl,
  type ScheduleExportStyle,
} from "./api";

export type ShareMethod = "native_share" | "wa_with_url" | "download_fallback";
export type ShareResult = { method: ShareMethod; ok: boolean; error?: string };

export interface ShareScheduleImageOpts {
  scheduleId: string;
  style: ScheduleExportStyle;
  weekStart: string; // YYYY-MM-DD — used in filename + message
  /** Public signed poster URL (from POST /poster-link). Required for
   *  wa_with_url method; without it the function falls back to download. */
  posterUrl?: string;
  /** Optional E.164 (or Israeli local 05X) phone to seed the wa.me link. */
  toPhone?: string;
  /** Override the WhatsApp message body. */
  text?: string;
}

/**
 * True when the runtime can attach FILES to a `navigator.share` call.
 *
 * `canShare({ files })` was added in Web Share API L2 (Chrome 89+, Safari
 * 16.4+). The capability check intentionally probes with a *real* (tiny)
 * File instance — some browsers (older Safari, Firefox desktop) advertise
 * `canShare` but reject files, so we have to try a synthetic file.
 *
 * Mobile-only gate: desktop browsers that expose share-with-files (e.g.
 * Edge on Windows) tend to forward to OS share sheets that don't include
 * WhatsApp Web, so we keep them on the URL path.
 */
export function canNativeShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return false;
  }
  // Mobile UA heuristic — only platform where WA appears in the share sheet.
  const ua = navigator.userAgent || "";
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  if (!isMobile) return false;
  try {
    const probe = new File([new Uint8Array([0])], "p.png", { type: "image/png" });
    return nav.canShare({ files: [probe] }) === true;
  } catch {
    return false;
  }
}

/** Strip the Israeli leading 0 / non-digits so wa.me accepts the phone. */
function normalisePhone(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d]/g, "");
  return digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
}

function buildWaUrl(phone: string | undefined, text: string): string {
  const p = normalisePhone(phone);
  const t = encodeURIComponent(text);
  return p ? `https://wa.me/${p}?text=${t}` : `https://wa.me/?text=${t}`;
}

function defaultText(weekStart: string, posterUrl?: string): string {
  const base = `📅 סידור עבודה לשבוע ${weekStart}`;
  return posterUrl ? `${base}\n${posterUrl}` : base;
}

/**
 * Drive the share. Returns the method actually used + ok/error.
 *
 * Caller is responsible for surfacing the result via toast — this function
 * never throws.
 */
export async function shareScheduleImage(
  opts: ShareScheduleImageOpts,
): Promise<ShareResult> {
  const { scheduleId, style, weekStart, posterUrl, toPhone, text } = opts;
  const message = text ?? defaultText(weekStart, posterUrl);

  // -------- 1. Native share with file (mobile only) --------
  if (canNativeShareFiles()) {
    try {
      const res = await fetch(getScheduleExportUrl(scheduleId, "png", style), {
        headers: await exportAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const file = new File(
        [blob],
        `schedule-${weekStart}-${style}.png`,
        { type: "image/png" },
      );
      const shareData: ShareData = {
        files: [file],
        title: "סידור שבועי",
        text: message,
      };
      const nav = navigator as Navigator & {
        canShare?: (d?: ShareData) => boolean;
      };
      // Re-check with the real file payload — some Androids fail at this step.
      if (nav.canShare && nav.canShare(shareData)) {
        await navigator.share(shareData);
        return { method: "native_share", ok: true };
      }
    } catch (err) {
      // AbortError = user cancelled the share sheet. Treat as success-ish.
      if ((err as DOMException)?.name === "AbortError") {
        return { method: "native_share", ok: false, error: "cancelled" };
      }
      // Fall through to URL / download paths.
    }
  }

  // -------- 2. wa.me with poster URL (auto image preview) --------
  if (posterUrl) {
    const win = window.open(
      buildWaUrl(toPhone, message),
      "_blank",
      "noopener,noreferrer",
    );
    return { method: "wa_with_url", ok: win !== null };
  }

  // -------- 3. Download + open wa.me (text only) --------
  try {
    const url = getScheduleExportUrl(scheduleId, "png", style);
    // Fetch as blob → same-origin blob URL → download attribute honoured.
    const res = await fetch(url, { headers: await exportAuthHeaders() });
    if (!res.ok) throw new Error(`שגיאת שרת ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `schedule-${weekStart}-${style}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    window.open(
      buildWaUrl(toPhone, message),
      "_blank",
      "noopener,noreferrer",
    );
    return { method: "download_fallback", ok: true };
  } catch (err) {
    return {
      method: "download_fallback",
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
