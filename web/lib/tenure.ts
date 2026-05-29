// Vacation entitlement table per Israeli labor law tiers — mirrors backend
// src/shared/tenure.ts (kept here as a lightweight client-side copy so the
// employee detail page can compute entitlement without a server round-trip).

/**
 * Annual vacation days entitled based on years of seniority.
 * Tiers (per Hebrew labor regulation):
 *   1–5 yrs   → 16 days
 *   6 yrs     → 18 days
 *   7 yrs     → 21 days
 *   8–9 yrs   → 23 days
 *   10–13 yrs → 24 days
 *   14+ yrs   → 28 days
 */
export function vacationDaysForSeniority(years: number): number {
  if (years < 1) return 16;
  if (years <= 5) return 16;
  if (years === 6) return 18;
  if (years === 7) return 21;
  if (years <= 9) return 23;
  if (years <= 13) return 24;
  return 28;
}
