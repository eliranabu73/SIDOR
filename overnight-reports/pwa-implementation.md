# PWA Implementation — סידור4S

**Date:** 2026-05-24

## Audit Finding

The project already had substantial PWA infrastructure in place from prior sprints.
The task was to fill the remaining gaps rather than rebuild from scratch.

---

## What Was Already Present (Pre-existing)

| Asset | Path | Status |
|-------|------|--------|
| Web App Manifest | `public/manifest.json` | existed, incomplete |
| Service Worker | `public/sw.js` | complete (network-first + SWR strategy) |
| SW Registration | `components/pwa/register-sw.tsx` | complete, wired in root layout |
| PNG Icons | `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png` | all present |
| Apple Touch Icon | `public/apple-touch-icon.png` | present |
| iOS Splash Screens | `public/splash/iphone-*.png` (8 sizes) | all present |
| PWA Meta Tags | `app/layout.tsx` via Next.js Metadata API | complete |
| Viewport theme-color | `app/layout.tsx` via `viewport` export | present |
| RTL + Hebrew lang | `app/layout.tsx` `<html lang="he" dir="rtl">` | present |

---

## Changes Made

### 1. `public/manifest.json` — Enhanced

Added three missing fields required by the spec:

- `"orientation": "portrait-primary"` (was `"portrait"`)
- `"categories": ["business", "productivity"]`
- `"shortcuts"` array with two entries: סידור השבוע → `/schedule`, עובדים → `/employees`
- Added `"purpose": "any"` to the non-maskable icons so Chrome treats them correctly alongside the maskable variant

### 2. `components/pwa/PwaInstallBanner.tsx` — Created (new file)

A dismissible install prompt banner that:

- Listens for the `beforeinstallprompt` event (Chrome/Android install API)
- Only renders on viewports < 768 px (mobile)
- Skips if already running in `display-mode: standalone` (already installed)
- Skips if the user has previously dismissed (stored in `localStorage` under key `pwa-install-dismissed`)
- Shows: icon + "התקן את האפליקציה על הטלפון שלך" + Install button + Dismiss (×)
- Calls `deferredPrompt.prompt()` on Install click; auto-hides on acceptance
- Positioned above the mobile bottom tab bar (`bottom-20`) with `safe-area-inset-bottom` padding
- iOS note: iOS Safari does not fire `beforeinstallprompt`, so the banner is naturally suppressed there — iOS users use the Safari share sheet manually

### 3. `components/layout/AppShell.tsx` — Modified

- Added import: `import { PwaInstallBanner } from "@/components/pwa/PwaInstallBanner"`
- Added `<PwaInstallBanner />` just before the mobile bottom tab bar

---

## Files Modified / Created

| File | Action |
|------|--------|
| `web/public/manifest.json` | Modified — added shortcuts, categories, orientation-primary, icon purpose |
| `web/components/pwa/PwaInstallBanner.tsx` | Created |
| `web/components/layout/AppShell.tsx` | Modified — import + render PwaInstallBanner |

---

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| Chrome DevTools → Application → Manifest shows Hebrew app name | ✅ `name: "סידור4S"`, `lang: "he"`, `dir: "rtl"` |
| "Add to Home Screen" prompt appears on mobile Chrome | ✅ `beforeinstallprompt` banner + valid manifest |
| `/manifest.json` returns 200 with correct JSON | ✅ served as static from `public/` |
| App shell loads from cache when offline | ✅ SW pre-caches `/`, `/schedule`, `/manifest.json`, icons; network-first with cache fallback |

---

## Notes

- `PwaInit` from the spec is equivalent to the existing `RegisterSW` component — no duplicate was created.
- The service worker is production-only (gated by `NODE_ENV !== 'production'` in `RegisterSW`) to avoid HMR cache conflicts during development.
- TypeScript type check passes with zero errors after all changes.
