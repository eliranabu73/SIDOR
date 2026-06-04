import { createElement, type ReactElement } from 'react';
import bidiFactory from 'bidi-js';
import { DateTime } from 'luxon';
import type { ExportStyle, ScheduleExportData, ExportShiftRow } from '../types';

// Satori renders LTR only — convert Hebrew logical-order strings to visual
// order using the Unicode Bidirectional Algorithm before passing to satori.
const _bidi = bidiFactory();
function vis(str: string): string {
  if (!str) return str;
  const levels = _bidi.getEmbeddingLevels(str, 'rtl');
  return _bidi.getReorderedString(str, levels);
}

// Sunday→Saturday in logical order; reversed below so ראשון is on the right.
const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

interface Theme {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  headerBg: string;
  headerText: string;
  accent: string;
  dayHeaderBg: string;
  dayHeaderText: string;
  shiftBg: string;
  shiftBorder: string;
  pill: string;
}

const THEMES: Record<ExportStyle, Theme> = {
  minimal: {
    bg: '#ffffff',
    card: '#ffffff',
    cardBorder: '#e5e7eb',
    text: '#0f172a',
    textMuted: '#475569',
    headerBg: '#f8fafc',
    headerText: '#0f172a',
    accent: '#0f172a',
    dayHeaderBg: '#f1f5f9',
    dayHeaderText: '#0f172a',
    shiftBg: '#ffffff',
    shiftBorder: '#e2e8f0',
    pill: '#0f172a',
  },
  branded: {
    bg: '#f8fafc',
    card: '#ffffff',
    cardBorder: '#c7d2fe',
    text: '#0f172a',
    textMuted: '#475569',
    headerBg: 'linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%)',
    headerText: '#ffffff',
    accent: '#4f46e5',
    dayHeaderBg: '#eef2ff',
    dayHeaderText: '#3730a3',
    shiftBg: '#ffffff',
    shiftBorder: '#e0e7ff',
    pill: '#4f46e5',
  },
  dark: {
    bg: '#020617',
    card: '#0f172a',
    cardBorder: '#1e293b',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    headerBg: '#0f172a',
    headerText: '#f8fafc',
    accent: '#22d3ee',
    dayHeaderBg: '#1e293b',
    dayHeaderText: '#22d3ee',
    shiftBg: '#0b1220',
    shiftBorder: '#1e293b',
    pill: '#22d3ee',
  },
};

export function groupShiftsByDay(
  shifts: ExportShiftRow[],
  weekStartIso: string,
): ExportShiftRow[][] {
  const buckets: ExportShiftRow[][] = Array.from({ length: 7 }, () => []);
  // weekStart is a local calendar day (YYYY-MM-DD). Bucket each shift by its
  // LOCAL start day (in the shift's own timezone) relative to weekStart, so an
  // Israel evening shift near midnight lands on the right column rather than
  // slipping a day under raw UTC.
  for (const s of shifts) {
    const dayIdx = localDayIndex(s.startsAt, s.timezone, weekStartIso);
    if (dayIdx >= 0 && dayIdx < 7) {
      buckets[dayIdx]!.push(s);
    }
  }
  // Sort each day's shifts by role then time, so same-role shifts sit together
  // (visual role separation) and the export reads top-to-bottom by start time.
  // Null-role shifts always sort LAST (not first) — they read as the catch-all.
  for (const b of buckets) {
    b.sort((a, c) => compareRole(a.role, c.role) || a.startsAt.localeCompare(c.startsAt));
  }
  return buckets;
}

// Order roles by Hebrew collation, but always push null-role shifts to the END
// (collation locales vary on where a sentinel lands, so branch explicitly).
function compareRole(a: string | null, c: string | null): number {
  if (a === null && c === null) return 0;
  if (a === null) return 1; // nulls last
  if (c === null) return -1;
  return a.localeCompare(c, 'he');
}

// 0-based index of a shift's LOCAL start day relative to weekStart (a local
// calendar day). Falls back to UTC when no timezone is supplied (back-compat).
function localDayIndex(
  startsAtIso: string,
  timezone: string | undefined,
  weekStartIso: string,
): number {
  const zone = timezone ?? 'UTC';
  const localDay = DateTime.fromISO(startsAtIso, { zone }).startOf('day');
  const weekStartDay = DateTime.fromISO(weekStartIso, { zone }).startOf('day');
  return Math.round(localDay.diff(weekStartDay, 'days').days);
}

// Stable per-role colour so each role is visually distinct in the poster.
const ROLE_HEXES = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#0ea5e9', '#d946ef', '#06b6d4', '#84cc16'];
export function roleColor(role: string | null, fallback: string): string {
  if (!role) return fallback;
  let h = 0;
  for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) >>> 0;
  return ROLE_HEXES[h % ROLE_HEXES.length]!;
}

// Format an instant as HH:mm in the given timezone. When no timezone is
// supplied, falls back to UTC (matching the legacy behaviour).
function formatHm(iso: string, timezone?: string): string {
  const dt = DateTime.fromISO(iso, { zone: timezone ?? 'UTC' });
  return dt.toFormat('HH:mm');
}

function formatHebDate(weekStartIso: string, dayIdx: number): string {
  const d = new Date(`${weekStartIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayIdx);
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${mm}`;
}

export function buildScheduleTemplate(
  data: ScheduleExportData,
  style: ExportStyle,
): ReactElement {
  const theme = THEMES[style];
  const buckets = groupShiftsByDay(data.shifts, data.weekStart);

  // Logo element — rendered only when a data URL is available.
  const logoEl = data.orgLogoDataUrl
    ? createElement('img', {
        src: data.orgLogoDataUrl,
        width: 64,
        height: 64,
        style: {
          display: 'flex',
          width: 64,
          height: 64,
          objectFit: 'contain' as const,
          borderRadius: 8,
          marginRight: 16,
          background: style === 'dark' ? '#1e293b' : '#ffffff',
        },
      })
    : null;

  // Header bar
  const header = createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        padding: '20px 32px',
        background: theme.headerBg,
        color: theme.headerText,
      },
    },
    // Left: logo (optional) + org name + subtitle
    createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'row', alignItems: 'center' } },
      logoEl,
      createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        createElement(
          'div',
          { style: { fontSize: 26, fontWeight: 700, color: theme.headerText } },
          vis(data.orgName),
        ),
        createElement(
          'div',
          {
            style: {
              fontSize: 16,
              marginTop: 4,
              color: style === 'branded' ? '#e0e7ff' : theme.textMuted,
            },
          },
          vis(`סידור עבודה לשבוע ${data.weekStart} – ${data.weekEnd}`),
        ),
      ),
    ),
    // Right: brand pill
    createElement(
      'div',
      {
        style: {
          display: 'flex',
          fontSize: 14,
          fontWeight: 600,
          padding: '6px 14px',
          borderRadius: 999,
          background: style === 'minimal' ? '#0f172a' : 'rgba(255,255,255,0.18)',
          color: style === 'minimal' ? '#ffffff' : theme.headerText,
        },
      },
      vis('סידור4S'),
    ),
  );

  // Day columns — reversed so ראשון (idx 0) appears on the RIGHT (RTL)
  const dayCols = HEB_DAYS.map((dayName, idx) => {
    const dayShifts = buckets[idx] ?? [];
    return createElement(
      'div',
      {
        key: idx,
        style: {
          display: 'flex',
          flexDirection: 'column',
          flex: '1 1 0',
          minWidth: 0,
          border: `1px solid ${theme.cardBorder}`,
          borderRadius: 10,
          background: theme.card,
          overflow: 'hidden',
        },
      },
      // Day header
      createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 6px',
            background: theme.dayHeaderBg,
            color: theme.dayHeaderText,
            borderBottom: `1px solid ${theme.cardBorder}`,
          },
        },
        createElement(
          'div',
          { style: { fontSize: 14, fontWeight: 700 } },
          vis(dayName),
        ),
        createElement(
          'div',
          { style: { fontSize: 11, marginTop: 2, color: theme.textMuted } },
          formatHebDate(data.weekStart, idx),
        ),
      ),
      // Shift list
      createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            padding: 6,
            gap: 6,
            flex: '1 1 0',
          },
        },
        ...dayShifts.slice(0, 6).map((s, sidx) => {
          const rc = roleColor(s.role, theme.accent);
          return createElement(
            'div',
            {
              key: sidx,
              style: {
                display: 'flex',
                flexDirection: 'column',
                padding: 6,
                borderRadius: 8,
                background: theme.shiftBg,
                border: `1px solid ${theme.shiftBorder}`,
                borderRight: `3px solid ${rc}`,
              },
            },
            createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  fontWeight: 700,
                  color: theme.text,
                },
              },
              createElement('span', null, `${formatHm(s.startsAt, s.timezone)}–${formatHm(s.endsAt, s.timezone)}`),
              s.role
                ? createElement(
                    'span',
                    { style: { color: rc, fontWeight: 700 } },
                    vis(s.role),
                  )
                : null,
            ),
            createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  fontSize: 10,
                  marginTop: 3,
                  color: theme.textMuted,
                },
              },
              vis(s.employeeNames.slice(0, 3).join(' · ') || '— לא משובץ —'),
            ),
          );
        }),
      ),
    );
  }).reverse(); // reverse so Sunday (idx 0) is rightmost column

  const grid = createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'row',
        gap: 8,
        padding: '16px 24px 20px 24px',
        flex: '1 1 0',
      },
    },
    ...dayCols,
  );

  const footer = createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: '8px 32px 16px 32px',
        fontSize: 12,
        color: theme.textMuted,
      },
    },
    createElement('span', null, vis(`${data.employees.length} עובדים · ${data.shifts.length} משמרות`)),
    createElement('span', null, `${vis('הופק ב')}-${new Date().toISOString().slice(0, 10)}`),
  );

  return createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: 1200,
        height: 675,
        background: theme.bg,
        color: theme.text,
        fontFamily: 'Heebo, system-ui, sans-serif',
      },
    },
    header,
    grid,
    footer,
  );
}
