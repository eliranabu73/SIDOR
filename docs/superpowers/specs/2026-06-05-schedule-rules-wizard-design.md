# Schedule Rules Wizard — Design Spec

**Date:** 2026-06-05
**Status:** Approved (design), pending implementation plan
**North star (/goal):** A manager builds a brand-new weekly schedule in **≤ 2 minutes**.
**Origin:** Tester (Tal) feedback — after signup there is no single, friendly place to
express the shape of a week ("10 in the morning, 10 in the evening, when is morning,
who is fixed"). The pieces exist in the backend but are scattered and have no cohesive UI.

---

## 1. Problem

Today, post-signup onboarding is: עסק → עובדים → **משמרות (dry shift-template list)** → סקירה.
The "משמרות" step asks for raw shift templates with jargon (`requiredEmployeeCount`,
role/location dropdowns) and never captures the manager's actual mental model:

- How many people per part-of-day (morning/evening/night)?
- What hours count as "morning" vs "evening"?
- Who is fixed where (Avi mornings only, Moti evenings only)?

And there is **no recurring pattern surfaced** — every week is rebuilt from scratch.
The employee fill-link (availability) exists but isn't tied into a clear build flow.

## 2. Key insight — reuse, don't rebuild

A backend audit (2026-06-05) found that **every engine needed already exists**:

| Need | Existing building block | File |
|------|------------------------|------|
| Recurring weekly pattern | `WeeklyTemplate` + `WeeklyTemplateShift` | `prisma/schema.prisma:547`; `src/modules/templates/weekly-template.service.ts` |
| Apply pattern → create shifts + pre-assign fixed people | `applyTemplateToSchedule` (creates Shifts, seeds `defaultEmployeeIds` as CONFIRMED) | `weekly-template.service.ts:141` |
| Headcount per shift + time window | `requiredEmployeeCount`, `startLocalTime`/`endLocalTime` | `WeeklyTemplateShift` |
| Soft "prefers mornings/evenings" | `EmployeePreferences.prefersMornings/prefersEvenings` | `prisma/schema.prisma:431`; `saveEmployeePreferences` API |
| Employee availability before build | fill-link `/e/{token}` → `replaceAvailability` → `EmployeeAvailabilityRule` | `src/modules/share/share.service.ts:235` |
| Auto-fill remaining headcount | greedy scheduler | `src/modules/scheduler/providers/greedy.provider.ts` |

**Therefore the work is ~90% new UI + a pure mapping layer + wiring. No new tables,
no new engine, no migration.**

## 3. Decisions (locked with user)

1. **Placement:** a new onboarding **step** "כללי סידור" that *replaces* the dry "משמרות"
   step, AND the same wizard is editable later from a Settings tab.
2. **Fixed-person mechanism:** BOTH — hard pre-assign via `defaultEmployeeIds` (auto-assigned
   every week) AND soft `prefersMornings/prefersEvenings` (scheduler honors).
3. **Free-text AI box** ("אבי רק בקרים" parsed by Claude): **Phase 2**, after the structured
   wizard works. Built on the existing Vision-import Claude pipeline.

## 4. Scope

### In scope (Phase 1)
- A reusable `RulesWizard` component used in two hosts: onboarding step + settings tab.
- A pure `rules-mapping` module: wizard state ⇄ `WeeklyTemplate` payload + employee prefs.
- Replace the onboarding "shifts" step body with the wizard (`mode="onboarding"`).
- New Settings tab "כללי סידור" hosting the wizard (`mode="settings"`).
- A "ערוך כללים" entry on `/schedule`.
- Wire the `/schedule` "build week" action to: apply canonical template → (optional) run
  greedy fill → manager edits.
- Friendly Hebrew labels, industry presets, inline help; hide raw `laborRules` JSON.
- End-to-end workflow verification on a **demo org** (never the production orgs
  מסעדת האלירן / בי פארם), measuring the ≤2-minute path.

### Out of scope (Phase 2+)
- Free-text natural-language rule box (AI parse).
- Per-employee multi-daypart fixed matrices beyond morning/evening/night.
- Multi-location rule divergence (Phase 1 = one canonical template per org; location
  override deferred).

## 5. UX / What the wizard captures

Plain Hebrew, structured (no free-text in Phase 1):

### 5.1 Day-parts (חלקי-יום)
- Chips: בוקר / ערב / לילה, with "+ הוסף חלק יום" (custom name).
- Each day-part row: **חלון שעות** (start–end via existing `TimeSelect`) + **כמה אנשים**
  (headcount, int ≥ 1).
- Industry presets seed defaults (restaurant → בוקר 09–15, ערב 17–23; retail → 09–19 ×1).

### 5.2 Pattern application
- Default: **same every active day**.
- "מתקדם" (collapsed): per-day override of headcount/windows. Active days come from the
  business step's `activeDaysOfWeek`.

### 5.3 Fixed people (אנשים קבועים)
- Add row: pick employee → choose day-part(s) → choose days (default: all active days).
- Effect (both):
  - **Hard:** that employee's id is added to `defaultEmployeeIds` of the matching
    `WeeklyTemplateShift`s → auto-assigned on every apply.
  - **Soft:** set `prefersMornings`/`prefersEvenings` on `EmployeePreferences` so the
    scheduler biases toward that day-part for any non-fixed weeks/shifts.

## 6. Data mapping (the pure module)

`web/lib/rules-mapping.ts` — no I/O, fully unit-testable. Defines:

```
type DayPart = { id: string; name: string; start: string; end: string; headcount: number };
type FixedAssignment = { employeeId: string; dayPartId: string; days: number[] };
type RulesState = {
  dayParts: DayPart[];
  activeDays: number[];            // 0..6, from business step
  perDayOverrides?: Record<number, Partial<Pick<DayPart,'headcount'>>[]>;
  fixed: FixedAssignment[];
};

// state -> backend payloads
toWeeklyTemplatePayload(state): { name: string; shifts: WeeklyTemplateShiftInput[] }
toEmployeePrefUpdates(state): Array<{ employeeId: string; prefersMornings?: boolean; prefersEvenings?: boolean }>

// backend -> state (for editing in settings)
fromWeeklyTemplate(template, prefs): RulesState
```

Mapping rules:
- One `WeeklyTemplateShift` per (active day × day-part), carrying that day-part's window +
  headcount.
- `defaultEmployeeIds` for a shift = every fixed employee whose `(dayPartId, day)` matches.
- Day-part → preference flag: name/window heuristic (a part starting before ~14:00 →
  mornings; starting at/after ~16:00 → evenings). Custom parts only affect hard assignment.
- Round-trip stable: `fromWeeklyTemplate(toWeeklyTemplatePayload(s))` preserves day-parts,
  windows, headcounts, and fixed assignments.

## 7. Build flow (≤2 min path)

On `/schedule`, the existing "בנה שבוע" action becomes:
1. Ensure canonical `WeeklyTemplate` exists (created/edited by the wizard).
2. `POST /v1/schedules/:scheduleId/apply-template` → shifts created + fixed people
   pre-assigned (existing, idempotent).
3. Optionally run greedy scheduler to fill remaining headcount from
   `EmployeeAvailabilityRule` (fed by fill-links) — existing `SchedulerService.run`.
4. Manager edits freely on the existing board; publishes via existing flow.

No change to the apply/scheduler engines; only the orchestration/call-site and progress UX
(parallelize independent calls, per-step toasts) are touched.

## 8. Components & boundaries

| Unit | Responsibility | Depends on |
|------|----------------|-----------|
| `components/rules/RulesWizard.tsx` | Orchestrate steps; load/save; `mode: 'onboarding' \| 'settings'` | mapping, api, DayPartEditor, FixedPeoplePicker |
| `components/rules/DayPartEditor.tsx` | Edit day-part chips: window + headcount | ui primitives, TimeSelect |
| `components/rules/FixedPeoplePicker.tsx` | Map employees → day-part(s) → days | ui primitives, employees list |
| `lib/rules-mapping.ts` | Pure state⇄payload transforms | (none — pure) |
| `app/onboarding/setup/shifts/page.tsx` | Host wizard in onboarding (replaces dry body) | RulesWizard |
| `app/settings/RulesTab.tsx` | Host wizard in settings | RulesWizard |

Interfaces are the typed payloads in §6; hosts pass `mode` + initial data and a save
callback. Wizard internals can change without touching hosts.

## 9. API usage (all existing)

- `fetchWeeklyTemplates` / `createWeeklyTemplate` / `updateWeeklyTemplate` — `web/lib/api.ts:1742+`
- `fetchEmployeePreferences` / `saveEmployeePreferences` — `web/lib/api.ts:1455+`
- `fetchRoles`, `fetchEmployees`, `fetchSettings` (active days, industry) — existing
- `applyTemplateToSchedule` via `POST /v1/schedules/:scheduleId/apply-template`
- Scheduler run + apply proposals — existing schedule-page calls

No new endpoints in Phase 1. If a "canonical template" convenience is needed, it is a thin
client wrapper over create/update (pick the single active template named "ברירת מחדל").

## 10. Error handling

- Wizard saves are optimistic per section with toast on failure + retry; partial saves never
  block paint (consistent with the existing non-blocking AuthGuard pattern).
- `apply-template` is idempotent (skips a week that already has shifts) — safe to retry.
- Greedy fill failure degrades to "shifts created, fill manually" rather than blocking the
  build.
- Validation: headcount ≥ 1; end > start; at least one day-part and one active day before
  the step can advance.

## 11. Testing

- **Unit (pure):** `rules-mapping.ts` — round-trip stability; fixed→`defaultEmployeeIds`
  correctness; day-part→preference heuristic; per-day overrides.
- **Component:** RulesWizard renders presets, add/remove day-part, fixed-person mapping,
  advance gating.
- **E2E (demo org only):** signup → rules wizard → build week → (fill-link availability) →
  publish, asserting the happy path and timing the ≤2-minute goal. Cleanup the demo org
  afterward. **Never touch production orgs' settings.**
- **Backend sanity:** existing suite stays green (no backend logic change in Phase 1).

## 12. Risks / mitigations

- *Day-part→preference heuristic is fuzzy* → only affects the SOFT bias; the HARD
  `defaultEmployeeIds` is exact, so a wrong heuristic never breaks fixed assignment.
- *Onboarding step replacement could regress existing flow* → keep the shift-template API
  writes equivalent (a day-part still becomes shift rows with headcount), so downstream
  (scheduler/operating-hours) is unaffected.
- *Scope creep into Phase 2 AI box* → explicitly deferred.

## 13. Rollout

1. Pure mapping module + unit tests.
2. Wizard components (no host wiring) behind the onboarding step.
3. Replace onboarding "shifts" body; verify the chain on a demo org.
4. Settings tab + `/schedule` "ערוך כללים" entry.
5. Wire/parallelize the build action + progress toasts.
6. E2E timing run on demo org; iterate to ≤2 min.
7. (Phase 2) free-text AI box.
