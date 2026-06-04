export type ExportStyle = 'minimal' | 'branded' | 'dark';

export type ExportFormat = 'png' | 'pdf';

export interface ExportShiftRow {
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  /**
   * IANA timezone the shift's local times should be rendered in (e.g.
   * 'Asia/Jerusalem'). Optional for backward-compat — when absent the template
   * falls back to UTC formatting/bucketing.
   */
  timezone?: string;
  role: string | null;
  location: string | null;
  employeeNames: string[];
  requiredCount: number;
}

export interface ExportEmployeeRow {
  id: string;
  fullName: string;
}

export interface ScheduleExportData {
  orgName: string;
  /** Base64 data URL of the org logo, pre-fetched server-side for satori. */
  orgLogoDataUrl: string | null;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  scheduleId: string;
  shifts: ExportShiftRow[];
  employees: ExportEmployeeRow[];
}

export function isExportStyle(v: unknown): v is ExportStyle {
  return v === 'minimal' || v === 'branded' || v === 'dark';
}
