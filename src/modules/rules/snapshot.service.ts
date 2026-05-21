import { SYSTEM_DEFAULT_RULES, type RulesSnapshot } from './types';

/**
 * Pure merge: org → location → (role/employee overrides — future) → system defaults.
 * Later, Redis-cached fetch wraps this; for now we keep the merge testable.
 */
export function mergeRulesSnapshot(
  orgRules: Partial<RulesSnapshot> | null | undefined,
  locationRules: Partial<RulesSnapshot> | null | undefined,
  overrides?: Partial<RulesSnapshot>,
): RulesSnapshot {
  return {
    ...SYSTEM_DEFAULT_RULES,
    ...(orgRules ?? {}),
    ...(locationRules ?? {}),
    ...(overrides ?? {}),
  };
}

/**
 * Coerces a raw labor_rules_jsonb (Prisma Json) into a partial snapshot,
 * tolerating both camelCase and snake_case fields per the spec doc.
 */
export function parseLaborRulesJson(raw: unknown): Partial<RulesSnapshot> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
  const pick = <T>(k: T, c?: T) => r[k as string] ?? (c ? r[c as string] : undefined);

  const out: Partial<RulesSnapshot> = {};
  const set = <K extends keyof RulesSnapshot>(
    key: K,
    val: RulesSnapshot[K] | undefined,
  ) => {
    if (val !== undefined) out[key] = val;
  };

  set('maxHoursPerDay', num(pick('maxHoursPerDay', 'max_hours_per_day')) as number | undefined);
  set('maxHoursPerWeek', num(pick('maxHoursPerWeek', 'max_hours_per_week')) as number | undefined);
  set(
    'minRestHoursBetweenShifts',
    num(pick('minRestHoursBetweenShifts', 'min_rest_hours_between_shifts')) as number | undefined,
  );
  set(
    'maxConsecutiveWorkDays',
    num(pick('maxConsecutiveWorkDays', 'max_consecutive_work_days')) as number | undefined,
  );
  set(
    'overtimeAfterDailyHours',
    num(pick('overtimeAfterDailyHours', 'overtime_after_daily_hours')) as number | undefined,
  );
  set(
    'overtimeAfterWeeklyHours',
    num(pick('overtimeAfterWeeklyHours', 'overtime_after_weekly_hours')) as number | undefined,
  );
  set(
    'requireRoleMatch',
    bool(pick('requireRoleMatch', 'require_role_match')) as boolean | undefined,
  );
  set(
    'requireAvailability',
    bool(pick('requireAvailability', 'require_availability')) as boolean | undefined,
  );
  set(
    'allowOvertimeWithWarning',
    bool(pick('allowOvertimeWithWarning', 'allow_overtime_with_warning')) as boolean | undefined,
  );
  return out;
}
