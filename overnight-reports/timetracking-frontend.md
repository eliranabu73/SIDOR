# Time Tracking Frontend — Implementation Report

**Date:** 2026-05-24  
**Sprint:** שעון נוכחות (Time Tracking)

---

## Files Modified

| File | Change |
|------|--------|
| `web/lib/api.ts` | Added time tracking API functions |
| `web/lib/queries.ts` | Added react-query hooks |
| `web/app/(employee)/me/[token]/page.tsx` | Added `ClockWidget` component + section |
| `web/components/layout/AppShell.tsx` | Added `/timetracking` nav link |

## Files Created

| File | Description |
|------|-------------|
| `web/app/timetracking/page.tsx` | Manager time tracking dashboard |

---

## What Was Built

### 1. API Client (`web/lib/api.ts`)

New functions added under "Time Tracking" section:

- `clockIn(body)` — authenticated POST to `/v1/timetracking/clock-in`
- `clockOut()` — authenticated POST to `/v1/timetracking/clock-out`
- `fetchTimetrackingStatus()` — authenticated GET, current user clock status
- `fetchTimeEntries(from, to, employeeId?)` — authenticated GET, entries list
- `fetchTimetrackingLive()` — authenticated GET, currently clocked-in employees
- `tokenClockIn(token)` — public POST via employee portal token
- `tokenClockOut(token)` — public POST via employee portal token
- `fetchTokenClockStatus(token)` — public GET via employee portal token

New TypeScript interfaces: `TimetrackingStatusResponse`, `TimetrackingClockResponse`, `TimeEntry`, `LiveClockStatus`, `TimetrackingLiveResponse`, `TokenClockStatus`.

### 2. React-Query Hooks (`web/lib/queries.ts`)

- `useTimetrackingStatus()` — refetchInterval 30s
- `useTimetrackingLive()` — refetchInterval 30s
- `useTimeEntries(from, to)` — on-demand, key includes date range
- `useClockIn()` — mutation, invalidates `['timetracking']` on success
- `useClockOut()` — mutation, invalidates `['timetracking']` on success

### 3. Employee Clock Widget

Location: top of `<PortalContent>` in the employee self-service portal.

Features:
- Fetches clock status on mount via `fetchTokenClockStatus(token)`
- **Clocked OUT state:** large emerald green button (h-16), "כניסה למשמרת", with `LogIn` icon
- **Clocked IN state:** large rose red button (h-16), "יציאה ממשמרת", with `LogOut` icon
- Live elapsed timer (`HH:MM:SS`) updating every second using `useEffect` + `setInterval`
- Shows clock-in time "מאז כניסה בשעה HH:mm"
- Animated pulse dot when clocked in (green)
- Loading spinner (Skeleton) while fetching, optimistic "מעדכן…" text during mutation
- If API returns null/fails → widget hidden gracefully (no error shown to employee)
- Mobile-first: large touch targets, clear green/red contrast, RTL Hebrew

### 4. Manager Dashboard (`/timetracking`)

Three-section layout wrapped in `<DemoBoundary>` + `<AppShell>`:

**Section A — Live Status**
- Shows currently clocked-in employees in real time
- Each row: avatar initial, name, clock-in time, elapsed duration
- Animated green pulse dot in header
- Auto-refreshes every 30s via `useTimetrackingLive`
- Demo mode shows 3 mock employees (נועה כהן, איתי לוי, מיה גולן)

**Section B — Entries Table**
- Date range picker (defaults to current week)
- Columns: עובד | כניסה | יציאה | סה"כ שעות | משמרת מתוכננת | הפרש
- Color coding by variance:
  - Emerald (≥ 0 min): actual ≥ scheduled
  - Amber (-30..0 min): within 30 min short
  - Rose (< -30 min): more than 30 min short
- Variance icons: `CheckCircle2` / `AlertTriangle`
- "ייצוא CSV" button: exports UTF-8 BOM CSV with Hebrew headers, named `timetracking-{from}_{to}.csv`
- Disabled when no entries

**Section C — Variance Summary**
- Total scheduled hours, total actual hours, total delta
- Color: rose if > 30 min short, emerald otherwise
- Shows ⚠ / ✓ indicator
- Hidden when no entries

### 5. Navigation

`Clock` icon from lucide-react added to AppShell nav array:
- Desktop: horizontal nav bar link
- Mobile: bottom tab bar (7th item, between Tips and Settings)
- Label: "נוכחות"
- Route: `/timetracking`

---

## Design Decisions

- Employee widget uses direct fetch (no react-query) since the portal page already manages its own state without QueryClientProvider
- Manager dashboard uses react-query hooks with 30s refetch for live data
- Demo mode: mock data rendered inline, no API calls, banner shown to indicate demo
- TypeScript `--noEmit` passes with zero errors after all changes
- `API_BASE` constant added in `api.ts` for token-based public endpoints (reuses same `NEXT_PUBLIC_API_URL` env var)

---

## Backend Endpoints Expected

The frontend calls these endpoints — backend must implement:

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /v1/timetracking/clock-in` | Bearer JWT | Clock in (manager/employee) |
| `POST /v1/timetracking/clock-out` | Bearer JWT | Clock out |
| `GET /v1/timetracking/status` | Bearer JWT | Current user clock status |
| `GET /v1/timetracking/entries?from&to` | Bearer JWT | Org entries for date range |
| `GET /v1/timetracking/live` | Bearer JWT | Currently clocked-in employees |
| `POST /v1/timetracking/token/:token/clock-in` | None (token) | Employee portal clock in |
| `POST /v1/timetracking/token/:token/clock-out` | None (token) | Employee portal clock out |
| `GET /v1/timetracking/token/:token/status` | None (token) | Employee portal status |
