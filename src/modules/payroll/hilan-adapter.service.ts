/**
 * Hilan payroll adapter.
 *
 * Maps an internal PayrollRow → Hilan-style column dictionary. Hilan (חילן)
 * is Israel's dominant payroll vendor; their CSV importers expect Hebrew
 * column headers and split overtime + Shabbat hours into discrete buckets.
 *
 * Best-guess mapping based on typical Hilan import templates — actual
 * implementations vary per customer; column names can be adjusted in one
 * place here without touching the export pipeline.
 */

export interface PayrollRow {
  employeeId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  totalHours: number;
  regularHours: number;
  ot125Hours: number;
  ot150Hours: number;
  weekendHours: number;
  totalGrossILS: number;
}

export const HILAN_HEADERS = [
  'מספר עובד',
  'שם פרטי',
  'שם משפחה',
  'סה״כ שעות רגילות',
  'שעות נוספות 125%',
  'שעות נוספות 150%',
  'שעות שבת/חג',
  'סה״כ ברוטו (ש״ח)',
] as const;

export const STANDARD_HEADERS = [
  'שם מלא',
  'תעודת זהות',
  'סה״כ שעות',
  'שעות רגילות',
  'שעות נוספות 125%',
  'שעות נוספות 150%',
  'שעות שבת',
  'סה״כ ברוטו (ש״ח)',
] as const;

/** Convert an internal PayrollRow into a Hilan-style column dictionary. */
export function toHilanRow(row: PayrollRow): Record<string, string> {
  return {
    'מספר עובד': row.idNumber,
    'שם פרטי': row.firstName,
    'שם משפחה': row.lastName,
    'סה״כ שעות רגילות': row.regularHours.toFixed(2),
    'שעות נוספות 125%': row.ot125Hours.toFixed(2),
    'שעות נוספות 150%': row.ot150Hours.toFixed(2),
    'שעות שבת/חג': row.weekendHours.toFixed(2),
    'סה״כ ברוטו (ש״ח)': row.totalGrossILS.toFixed(2),
  };
}

/** Convert an internal PayrollRow into the generic Hebrew column dictionary. */
export function toStandardRow(row: PayrollRow): Record<string, string> {
  return {
    'שם מלא': row.fullName,
    'תעודת זהות': row.idNumber,
    'סה״כ שעות': row.totalHours.toFixed(2),
    'שעות רגילות': row.regularHours.toFixed(2),
    'שעות נוספות 125%': row.ot125Hours.toFixed(2),
    'שעות נוספות 150%': row.ot150Hours.toFixed(2),
    'שעות שבת': row.weekendHours.toFixed(2),
    'סה״כ ברוטו (ש״ח)': row.totalGrossILS.toFixed(2),
  };
}
