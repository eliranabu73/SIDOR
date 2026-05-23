import { createElement } from 'react';
// @react-pdf/renderer is ESM-only — load dynamically so CJS jest can still
// import this module without choking on the static ESM import.
import type { ExportStyle, ScheduleExportData, ExportShiftRow } from './types';

const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

interface PdfTheme {
  bg: string;
  card: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  headerBg: string;
  headerText: string;
  dayHeaderBg: string;
  dayHeaderText: string;
}

const THEMES: Record<ExportStyle, PdfTheme> = {
  minimal: {
    bg: '#ffffff',
    card: '#ffffff',
    border: '#e5e7eb',
    text: '#0f172a',
    textMuted: '#475569',
    accent: '#0f172a',
    headerBg: '#f8fafc',
    headerText: '#0f172a',
    dayHeaderBg: '#f1f5f9',
    dayHeaderText: '#0f172a',
  },
  branded: {
    bg: '#f8fafc',
    card: '#ffffff',
    border: '#c7d2fe',
    text: '#0f172a',
    textMuted: '#475569',
    accent: '#4f46e5',
    headerBg: '#4f46e5',
    headerText: '#ffffff',
    dayHeaderBg: '#eef2ff',
    dayHeaderText: '#3730a3',
  },
  dark: {
    bg: '#0b1220',
    card: '#0f172a',
    border: '#1e293b',
    text: '#f1f5f9',
    textMuted: '#94a3b8',
    accent: '#22d3ee',
    headerBg: '#0f172a',
    headerText: '#f8fafc',
    dayHeaderBg: '#1e293b',
    dayHeaderText: '#22d3ee',
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
    if (dayIdx >= 0 && dayIdx < 7) buckets[dayIdx]!.push(s);
  }
  return buckets;
}

function formatHm(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d
    .getUTCMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function formatHebDate(weekStartIso: string, dayIdx: number): string {
  const d = new Date(`${weekStartIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayIdx);
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${dd}/${mm}`;
}

function makeStyles(
  theme: PdfTheme,
  StyleSheet: typeof import('@react-pdf/renderer').StyleSheet,
) {
  return StyleSheet.create({
    page: {
      backgroundColor: theme.bg,
      padding: 24,
      color: theme.text,
      fontSize: 9,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.headerBg,
      color: theme.headerText,
      padding: 14,
      borderRadius: 6,
      marginBottom: 14,
    },
    headerTitle: { color: theme.headerText, fontSize: 16, fontWeight: 700 },
    headerSubtitle: { color: theme.headerText, fontSize: 10, marginTop: 3, opacity: 0.85 },
    brandMark: {
      color: theme.headerText,
      fontSize: 10,
      fontWeight: 700,
      border: `1px solid ${theme.headerText}`,
      padding: '3 8',
      borderRadius: 999,
    },
    grid: { flexDirection: 'row', gap: 4, flex: 1 },
    dayCol: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 6,
      backgroundColor: theme.card,
    },
    dayHeader: {
      backgroundColor: theme.dayHeaderBg,
      color: theme.dayHeaderText,
      padding: 5,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    dayName: { color: theme.dayHeaderText, fontSize: 10, fontWeight: 700 },
    dayDate: { color: theme.textMuted, fontSize: 8, marginTop: 1 },
    shiftList: { padding: 4, gap: 3 },
    shiftCard: {
      borderWidth: 1,
      borderColor: theme.border,
      borderLeftWidth: 2,
      borderLeftColor: theme.accent,
      borderRadius: 4,
      padding: 4,
    },
    shiftTimeRow: { flexDirection: 'row', justifyContent: 'space-between' },
    shiftTime: { fontSize: 8, fontWeight: 700, color: theme.text },
    shiftRole: { fontSize: 8, fontWeight: 700, color: theme.accent },
    shiftEmployees: { fontSize: 7, color: theme.textMuted, marginTop: 2 },
    footer: {
      marginTop: 10,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 8,
      color: theme.textMuted,
    },
    footerText: { color: theme.textMuted, fontSize: 8 },
  });
}

export async function renderPdf(
  data: ScheduleExportData,
  style: ExportStyle,
): Promise<Buffer> {
  const theme = THEMES[style];
  const dynImport = new Function('s', 'return import(s)') as (
    s: string,
  ) => Promise<unknown>;
  const mod = (await dynImport(
    '@react-pdf/renderer',
  )) as typeof import('@react-pdf/renderer');
  const { Document, Page, Text, View, StyleSheet, renderToBuffer } = mod;
  const s = makeStyles(theme, StyleSheet);
  const buckets = groupShiftsByDay(data.shifts, data.weekStart);

  const headerEl = createElement(
    View,
    { style: s.header },
    createElement(
      View,
      null,
      createElement(Text, { style: s.headerTitle }, data.orgName),
      createElement(
        Text,
        { style: s.headerSubtitle },
        `Week ${data.weekStart} – ${data.weekEnd}`,
      ),
    ),
    createElement(Text, { style: s.brandMark }, 'Sidor4S'),
  );

  const dayCols = HEB_DAYS.map((dayName, idx) => {
    const dayShifts = buckets[idx] ?? [];
    return createElement(
      View,
      { key: idx, style: s.dayCol },
      createElement(
        View,
        { style: s.dayHeader },
        createElement(Text, { style: s.dayName }, dayName),
        createElement(Text, { style: s.dayDate }, formatHebDate(data.weekStart, idx)),
      ),
      createElement(
        View,
        { style: s.shiftList },
        ...dayShifts.slice(0, 8).map((sh, j) =>
          createElement(
            View,
            { key: j, style: s.shiftCard },
            createElement(
              View,
              { style: s.shiftTimeRow },
              createElement(
                Text,
                { style: s.shiftTime },
                `${formatHm(sh.startsAt)}-${formatHm(sh.endsAt)}`,
              ),
              sh.role
                ? createElement(Text, { style: s.shiftRole }, sh.role)
                : null,
            ),
            createElement(
              Text,
              { style: s.shiftEmployees },
              sh.employeeNames.slice(0, 3).join(' · ') || '—',
            ),
          ),
        ),
      ),
    );
  });

  const doc = createElement(
    Document,
    null,
    createElement(
      Page,
      { size: 'A4', orientation: 'landscape', style: s.page },
      headerEl,
      createElement(View, { style: s.grid }, ...dayCols),
      createElement(
        View,
        { style: s.footer },
        createElement(
          Text,
          { style: s.footerText },
          `${data.shifts.length} shifts | ${data.employees.length} employees`,
        ),
        createElement(
          Text,
          { style: s.footerText },
          `Generated ${new Date().toISOString().slice(0, 10)}`,
        ),
      ),
    ),
  );

  const buf = await renderToBuffer(doc);
  return buf as Buffer;
}
