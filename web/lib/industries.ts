/**
 * Shared industry options for org-creation flows.
 *
 * Used by:
 *   - web/app/onboarding/page.tsx (first-time org creation)
 *   - web/app/settings/page.tsx   (post-creation editing)
 *
 * Keep the list in sync with the backend: any free-string industry is accepted
 * server-side (no enum constraint on the column), but these are the canonical
 * Hebrew labels shown in the UI.
 */
export const INDUSTRY_OPTIONS = [
  { value: "restaurant",   label: "מסעדה / קפה" },
  { value: "retail",       label: "קמעונאות / חנות" },
  { value: "pharmacy",     label: "פארם / בית מרקחת" },
  { value: "kindergarten", label: "גן ילדים / צהרון" },
  { value: "school",       label: "בית ספר / אקדמיה" },
  { value: "homecare",     label: "שירותי בית / סיעוד" },
  { value: "events",       label: "אירועים / קייטרינג" },
  { value: "garage",       label: "מוסך / שירות רכב" },
  { value: "clinic",       label: "מרפאה / קליניקה" },
  { value: "hotel",        label: "מלון / אירוח" },
  { value: "security",     label: "אבטחה / שמירה" },
  { value: "warehouse",    label: "מחסן / לוגיסטיקה" },
  { value: "other",        label: "אחר (הזן ידנית)" },
] as const;

/** Canonical industry value (the `value` of one of `INDUSTRY_OPTIONS`). */
export type IndustryValue = (typeof INDUSTRY_OPTIONS)[number]["value"];
