export type ExportStyle = 'minimal' | 'branded' | 'dark';

export type ExportFormat = 'png' | 'pdf';

export interface ExportShiftRow {
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
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
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  scheduleId: string;
  shifts: ExportShiftRow[];
  employees: ExportEmployeeRow[];
}

export function isExportStyle(v: unknown): v is ExportStyle {
  return v === 'minimal' || v === 'branded' || v === 'dark';
}
