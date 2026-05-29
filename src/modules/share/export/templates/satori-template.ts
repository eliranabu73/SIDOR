import { createElement, type ReactElement } from 'react';
import type { ExportStyle, ScheduleExportData, ExportShiftRow } from '../types';

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

function groupShiftsByDay(
  shifts: ExportShiftRow[],
  weekStartIso: string,
): ExportShiftRow[][] {
  const buckets: ExportShiftRow[][] = Array.from({ length: 7 }, () => []);
  const weekStart = new Date(`${weekStartIso}T00:00:00Z`).getTime();
  for (const s of shifts) {
    const t = new Date(s.startsAt).getTime();
    const dayIdx = Math.floor((t - weekStart) / 86400000);
    if (dayIdx >= 0 && dayIdx < 7) {
      buckets[dayIdx]!.push(s);
    }
  }
  return buckets;
}

function formatHm(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours().toString().padStart(2, '0');
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
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
        padding: '24px 32px',
        background: theme.headerBg,
        color: theme.headerText,
      },
    },
    createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      createElement(
        'div',
        { style: { fontSize: 28, fontWeight: 700, color: theme.headerText } },
        data.orgName,
      ),
      createElement(
        'div',
        {
          style: {
            fontSize: 18,
            marginTop: 4,
            color: style === 'branded' ? '#e0e7ff' : theme.textMuted,
          },
        },
        `סידור עבודה לשבוע ${data.weekStart} – ${data.weekEnd}`,
      ),
    ),
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
      'סידור4S',
    ),
  );

  // Day columns
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
          dayName,
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
        ...dayShifts.slice(0, 6).map((s, sidx) =>
          createElement(
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
                borderInlineStart:
                  style === 'dark' || style === 'branded'
                    ? `3px solid ${theme.accent}`
                    : `2px solid ${theme.accent}`,
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
              createElement('span', null, `${formatHm(s.startsAt)}–${formatHm(s.endsAt)}`),
              s.role
                ? createElement(
                    'span',
                    { style: { color: theme.accent, fontWeight: 600 } },
                    s.role,
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
              s.employeeNames.slice(0, 3).join(' · ') || '— לא משובץ —',
            ),
          ),
        ),
      ),
    );
  });

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
    createElement('span', null, `${data.shifts.length} משמרות · ${data.employees.length} עובדים`),
    createElement('span', null, `הופק ב-${new Date().toISOString().slice(0, 10)}`),
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
        direction: 'rtl',
      },
    },
    header,
    grid,
    footer,
  );
}
