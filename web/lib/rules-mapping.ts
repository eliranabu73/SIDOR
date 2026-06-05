/**
 * rules-mapping — PURE transforms between the friendly "schedule rules" wizard
 * state and the existing backend payloads (WeeklyTemplate + EmployeePreferences).
 *
 * This module has NO I/O and NO imports. Its input/output types are declared
 * structurally so they unify (TS structural typing) with the corresponding
 * `web/lib/api.ts` interfaces at the call sites — without importing api.ts
 * (which pulls in the browser Supabase client and can't load in a node test).
 *
 * The single source of truth for a recurring week is ONE canonical WeeklyTemplate
 * per org, named DEFAULT_TEMPLATE_NAME.
 */

// ---------------------------------------------------------------------------
// Wizard state (what the UI edits)
// ---------------------------------------------------------------------------

export type DayPart = {
  /** Stable client id (not persisted). */
  id: string;
  /** Display name — בוקר / ערב / לילה / custom. */
  name: string;
  /** "HH:MM" local. */
  start: string;
  /** "HH:MM" local. */
  end: string;
  /** How many employees this part needs (per day). int >= 1. */
  headcount: number;
};

export type FixedAssignment = {
  employeeId: string;
  dayPartId: string;
  /** Days (0=Sun..6=Sat) this person is fixed to the part. */
  days: number[];
};

export type RulesState = {
  dayParts: DayPart[];
  /** Active days of the week, 0=Sun..6=Sat. */
  activeDays: number[];
  /** Optional per-day headcount override: day -> dayPartId -> headcount. */
  perDayHeadcount?: Record<number, Record<string, number>>;
  fixed: FixedAssignment[];
};

// ---------------------------------------------------------------------------
// Backend-facing payload shapes (structurally match api.ts)
// ---------------------------------------------------------------------------

export type WeeklyTemplateShiftInput = {
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  timezone?: string;
  roleId?: string | null;
  requiredEmployeeCount?: number;
  defaultEmployeeIds?: string[];
};

export type WeeklyTemplatePayload = {
  name: string;
  locationId?: string | null;
  shifts: WeeklyTemplateShiftInput[];
};

export type EmployeePrefUpdate = {
  employeeId: string;
  prefersMornings?: boolean;
  prefersEvenings?: boolean;
};

/** Minimal read shapes for the reverse mapping (subset of api.ts WeeklyTemplate). */
export type WeeklyTemplateShiftRead = {
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: number;
  defaultEmployeeIds: string[];
};
export type WeeklyTemplateRead = {
  name: string;
  shifts: WeeklyTemplateShiftRead[];
};

export const DEFAULT_TEMPLATE_NAME = "ברירת מחדל";

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/** "HH:MM" -> minutes since midnight. Tolerates "H:MM" and trailing ":SS". */
export function timeToMinutes(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/** Day-part classification used ONLY for the soft preference flag. */
export type DayPartClass = "morning" | "evening" | "other";

/**
 * A part that STARTS before 14:00 counts as morning; a part that starts at or
 * after 16:00 counts as evening; everything else is "other" (affects only the
 * soft preference, never the hard defaultEmployeeIds assignment).
 */
export function classifyDayPart(start: string): DayPartClass {
  const mins = timeToMinutes(start);
  if (mins < 14 * 60) return "morning";
  if (mins >= 16 * 60) return "evening";
  return "other";
}

// ---------------------------------------------------------------------------
// Forward: wizard state -> backend payloads
// ---------------------------------------------------------------------------

function headcountFor(state: RulesState, day: number, part: DayPart): number {
  const override = state.perDayHeadcount?.[day]?.[part.id];
  const n = override ?? part.headcount;
  return Math.max(1, Math.floor(n));
}

/**
 * Build the canonical WeeklyTemplate payload: one shift per (active day × day-part).
 * `defaultEmployeeIds` on a shift = every fixed employee whose (dayPartId, day) matches.
 */
export function toWeeklyTemplatePayload(
  state: RulesState,
  opts: { timezone?: string; name?: string; locationId?: string | null } = {},
): WeeklyTemplatePayload {
  const days = [...new Set(state.activeDays)].sort((a, b) => a - b);
  const shifts: WeeklyTemplateShiftInput[] = [];

  for (const day of days) {
    for (const part of state.dayParts) {
      const defaultEmployeeIds = state.fixed
        .filter((f) => f.dayPartId === part.id && f.days.includes(day))
        .map((f) => f.employeeId);
      // de-dup while preserving order
      const uniqueIds = [...new Set(defaultEmployeeIds)];

      shifts.push({
        dayOfWeek: day,
        startLocalTime: part.start,
        endLocalTime: part.end,
        ...(opts.timezone ? { timezone: opts.timezone } : {}),
        roleId: null,
        requiredEmployeeCount: headcountFor(state, day, part),
        defaultEmployeeIds: uniqueIds,
      });
    }
  }

  return {
    name: opts.name ?? DEFAULT_TEMPLATE_NAME,
    ...(opts.locationId !== undefined ? { locationId: opts.locationId } : {}),
    shifts,
  };
}

/**
 * Derive soft preference flags per employee from their fixed assignments.
 * A person fixed to any morning part -> prefersMornings; any evening part ->
 * prefersEvenings. Both can be true. Employees with only "other" parts get an
 * update with both flags false (explicitly clears stale bias).
 */
export function toEmployeePrefUpdates(state: RulesState): EmployeePrefUpdate[] {
  const byEmp = new Map<string, { m: boolean; e: boolean }>();
  const classOf = new Map(
    state.dayParts.map((p) => [p.id, classifyDayPart(p.start)] as const),
  );

  for (const f of state.fixed) {
    const cls = classOf.get(f.dayPartId);
    if (!cls) continue;
    const cur = byEmp.get(f.employeeId) ?? { m: false, e: false };
    if (cls === "morning") cur.m = true;
    if (cls === "evening") cur.e = true;
    byEmp.set(f.employeeId, cur);
  }

  return [...byEmp.entries()].map(([employeeId, v]) => ({
    employeeId,
    prefersMornings: v.m,
    prefersEvenings: v.e,
  }));
}

// ---------------------------------------------------------------------------
// Reverse: backend template (+ optional prefs) -> wizard state
// ---------------------------------------------------------------------------

function partKey(s: { startLocalTime: string; endLocalTime: string }): string {
  return `${s.startLocalTime}-${s.endLocalTime}`;
}

/** Default Hebrew name for a reconstructed part, by classification. */
function defaultPartName(start: string): string {
  switch (classifyDayPart(start)) {
    case "morning":
      return "בוקר";
    case "evening":
      return "ערב";
    default:
      return "צהריים";
  }
}

/**
 * Reconstruct wizard state from the canonical template. Shifts are grouped into
 * day-parts by their (start,end) window. Headcount uses the most common value
 * across days; any day that differs is recorded in perDayHeadcount. Fixed people
 * are read back from each shift's defaultEmployeeIds.
 *
 * Round-trip guarantee: for state produced by toWeeklyTemplatePayload, this
 * recovers the same day-part windows, headcounts, active days, and fixed set
 * (day-part *names* are regenerated, not preserved).
 */
export function fromWeeklyTemplate(template: WeeklyTemplateRead): RulesState {
  const activeDays = [...new Set(template.shifts.map((s) => s.dayOfWeek))].sort(
    (a, b) => a - b,
  );

  // Group shifts by window -> day-part.
  const groups = new Map<string, WeeklyTemplateShiftRead[]>();
  for (const s of template.shifts) {
    const k = partKey(s);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }

  const dayParts: DayPart[] = [];
  const fixed: FixedAssignment[] = [];
  const perDayHeadcount: Record<number, Record<string, number>> = {};

  let idx = 0;
  for (const [, shifts] of groups) {
    const first = shifts[0]!;
    const id = `dp-${idx++}`;
    // Modal headcount = the part's baseline.
    const counts = new Map<number, number>();
    for (const s of shifts)
      counts.set(s.requiredEmployeeCount, (counts.get(s.requiredEmployeeCount) ?? 0) + 1);
    let baseline = first.requiredEmployeeCount;
    let best = -1;
    for (const [val, freq] of counts) {
      if (freq > best) {
        best = freq;
        baseline = val;
      }
    }

    dayParts.push({
      id,
      name: defaultPartName(first.startLocalTime),
      start: first.startLocalTime,
      end: first.endLocalTime,
      headcount: baseline,
    });

    for (const s of shifts) {
      if (s.requiredEmployeeCount !== baseline) {
        (perDayHeadcount[s.dayOfWeek] ??= {})[id] = s.requiredEmployeeCount;
      }
      for (const empId of s.defaultEmployeeIds ?? []) {
        let row = fixed.find((f) => f.employeeId === empId && f.dayPartId === id);
        if (!row) {
          row = { employeeId: empId, dayPartId: id, days: [] };
          fixed.push(row);
        }
        if (!row.days.includes(s.dayOfWeek)) row.days.push(s.dayOfWeek);
      }
    }
  }

  for (const f of fixed) f.days.sort((a, b) => a - b);

  const result: RulesState = { dayParts, activeDays, fixed };
  if (Object.keys(perDayHeadcount).length > 0) result.perDayHeadcount = perDayHeadcount;
  return result;
}

// ---------------------------------------------------------------------------
// Industry presets (seed defaults for a fresh org)
// ---------------------------------------------------------------------------

export function presetDayParts(industry: string | null | undefined): DayPart[] {
  const ind = (industry ?? "").toLowerCase();
  const isRestaurant = /restaurant|food|cafe|מסעד|בית קפה|אוכל|בר/.test(ind);
  if (isRestaurant) {
    return [
      { id: "dp-morning", name: "בוקר", start: "09:00", end: "15:00", headcount: 2 },
      { id: "dp-evening", name: "ערב", start: "17:00", end: "23:00", headcount: 2 },
    ];
  }
  // Generic retail-ish single daypart.
  return [{ id: "dp-day", name: "יום", start: "09:00", end: "19:00", headcount: 1 }];
}
