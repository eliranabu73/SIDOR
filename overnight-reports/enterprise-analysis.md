# Enterprise Analysis: sidor4S
## Evaluator: רשת קפה נמרוד (100 employees, 5 branches)
## Date: 2026-05-24

---

## Executive Summary

**Short answer: Not yet ready for a 100-employee, 5-branch chain — but the bones are solid.**

sidor4S is a well-architected scheduling SaaS targeting Israeli SMBs. The database schema, compliance engine, and payroll module show genuine product thinking for the Israeli market. However, several enterprise-critical features are either missing, incomplete, or have known performance ceilings that would be painful at our scale.

Verdict: **Would work for a single-location operation of up to ~30 employees today.** With 6–9 months of focused development, it could handle our 5-branch, 100-employee scenario.

---

## Critical Gaps (Blockers for Enterprise Adoption)

### 1. BRANCH MANAGER ROLE DOES NOT EXIST

**File:** `prisma/schema.prisma` lines 22-27, `src/modules/auth/auth.plugin.ts`

The `MembershipRole` enum only has two values:

```typescript
enum MembershipRole {
  OWNER
  MANAGER
}
```

There is no `BRANCH_MANAGER` role. A branch manager at סניף תל אביב can see and edit schedules for all 5 branches. There is no data-level permission boundary short of separate organizations per branch — which breaks consolidated payroll and analytics entirely.

**Impact:** Any of our 5 branch managers can accidentally (or intentionally) modify another branch's schedule. This is a data integrity risk and a compliance risk under our operations policy.

**Effort to fix:** Medium — requires adding `BRANCH_MANAGER` to the enum, adding a `locationId` FK to `Membership`, and enforcing location-scoped RLS policies on `schedules`, `shifts`, and `assignments`. Estimated 3–4 weeks.

---

### 2. PAYROLL EXPORT HAS NO LOCATION FILTER

**File:** `src/modules/payroll/payroll.routes.ts`, `src/modules/payroll/payroll.service.ts`

The export route signature:

```typescript
const ExportQuery = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  format: z.enum(['standard', 'hilan']).default('standard'),
});
```

There is no `locationId` parameter. Running payroll exports combines all 5 branches into one file. Each of our branches has a separate cost center in Hilan. The accountant needs per-branch exports.

**Secondary issue:** The `idNumber` field in `PayrollRow` (line 227, `payroll.service.ts`) is hardcoded as an empty string: `idNumber: ''`. The Hilan format exports `'מספר עובד': row.idNumber` which will always be blank. The `Employee` schema has no `idNumber` / תעודת זהות field. This means the Hilan import will fail validation in any organization with strict ID matching.

**Impact:** Every month, accountant manually splits the combined CSV by branch. 100 employees × 5 branches = error-prone manual work.

**Effort to fix:** Small for location filter (add query param, pass to `where` clause). Large for ID number (requires schema migration + UI for data collection).

---

### 3. AUTO-SCHEDULER HAS AN O(SHIFTS × EMPLOYEES) CANDIDATE MATRIX — NO UPPER BOUND

**File:** `src/modules/scheduler/candidate-generation.service.ts` lines 82–133

The candidate generation loop:

```typescript
for (const shift of shifts) {
  for (const employee of employees) {
    // ... runs validateAssignment for every pair
    const validation = await validateAssignment(ctx);
```

For a 5-branch weekly schedule: 100 employees × (let's say 35 shifts per branch × 5 branches = 175 shifts) = **17,500 validation calls in series**. Each `validateAssignment` runs 13 rules via `Promise.all`. This is a blocking serverless function — on Vercel with a 10-second timeout, it will hard-fail.

The comment in the greedy provider says: *"O(shifts × employees) — fine for ~10k candidates."* 17,500 is over that. And that's a conservative week; holiday weeks with extra shifts push it higher.

**There is no employee count limit or guard in the scheduler routes.**

**File:** `src/modules/scheduler/scheduler.routes.ts` — no `take` or limit on the employee or shift queries passed to `generateCandidates`.

**Impact:** Auto-schedule button times out for full-org runs. Managers must manually assign or run branch-by-branch (if they could, which they cannot — see gap #1).

**Effort to fix:** Medium — pre-filter candidates by location before the inner loop, add a configurable candidate cap, use database-side filtering to fetch only employees at the relevant location.

---

### 4. `/v1/employees` HAS NO PAGINATION

**File:** `src/modules/reads/reads.routes.ts` lines 147–150

```typescript
const employees = await db.query((tx) =>
  tx.employee.findMany({
    where: { organizationId: orgId, isActive: true },
    include: { roles: { include: { role: true } } },
    orderBy: { fullName: 'asc' },
  }),
);
```

No `take`, no cursor, no pagination. Every page load fetches all 100 employees with their role relations. On the employees page (`web/app/employees/page.tsx` lines 190–203), this is compounded by immediately firing **two more queries per employee**:

```typescript
const availabilityResults = useQueries({
  queries: employeeIds.map((id) => ({
    queryFn: () => fetchEmployeeAvailability(id),  // 100 HTTP requests
  })),
});
const preferencesResults = useQueries({
  queries: employeeIds.map((id) => ({
    queryFn: () => fetchEmployeePreferences(id),  // 100 HTTP requests
  })),
});
```

**100 employees = 201 HTTP requests on page load** (1 employees list + 100 availability + 100 preferences). This is a severe N+1 problem at our scale. Expect 10–30 second load times, rate limiting on Vercel's edge, and a poor user experience.

**Effort to fix:** Medium — add pagination to `/v1/employees`, add a bulk preferences/availability endpoint, lazy-load constraint counts.

---

### 5. EMPLOYEES CANNOT BE ASSIGNED TO MULTIPLE LOCATIONS

**File:** `prisma/schema.prisma` lines 289–331

The `Employee` model only has:

```prisma
defaultLocationId String? @db.Uuid
```

A single `defaultLocationId`. No junction table. An employee who floats between Haifa and Tel Aviv branches cannot be represented. For a coffee chain where we routinely shift baristas between branches during peak season, this is a structural gap.

**File:** `src/modules/employees/employees.routes.ts` — the `CreateEmployeeBody` and `UpdateEmployeeBody` schemas only accept a single `defaultLocationId`.

**Effort to fix:** Large — requires a new `EmployeeLocation` junction table, migration, updated API schemas, and scheduler changes to use the junction table for eligibility.

---

## Missing Features (Not Blockers, But Important)

### 6. No Aggregate Cross-Branch Analytics

**File:** `src/modules/labor-cost/labor-cost.routes.ts`, `src/modules/reads/reads.routes.ts`

The labor cost dashboard is per-organization, not per-location. While `perLocation` is computed in `labor-cost.service.ts` (line 185+), it aggregates all locations together — there is no way for the chain owner to see "this week, branch Haifa cost ₪18,400 vs. branch Tel Aviv ₪22,100" without exporting CSV and doing Excel math.

The fairness route (`/v1/fairness`) is similarly org-wide with no location breakout.

**Effort to fix:** Small — add `locationId` query param to labor-cost and fairness endpoints.

---

### 7. Bulk Import Is Text-Area Only, No CSV Upload

**File:** `web/app/employees/page.tsx` lines 56–72

The "ייבוא מרובה" (bulk import) is a free-text textarea that parses comma/tab/dash-delimited lines. It does:
- No CSV file upload
- No Excel/XLSX support
- No column mapping UI
- No import preview with validation errors per row
- No rollback on partial failure (line 165: `failed += 1` but already-imported rows stay)

For onboarding 100 employees from our existing Hilan HR system, this requires manually reformatting employee data or pasting 100 lines of text. The import API endpoint (`import.routes.ts`) supports up to 500 employees in the `employees` array — the backend can handle it, but the UI doesn't expose a proper file import.

**Effort to fix:** Medium — add CSV file upload, column mapper, dry-run preview.

---

### 8. No Michpal Export Format

**File:** `src/modules/payroll/hilan-adapter.service.ts`, `src/modules/payroll/payroll.routes.ts`

The system exports to `standard` (generic Hebrew CSV) or `hilan` format. Michpal (מיכפל) is the second most common Israeli payroll system. Many small chains, including some of our franchise partners, use Michpal. No Michpal adapter exists.

**Effort to fix:** Small — add a `michpal-adapter.service.ts` mirroring the Hilan adapter with Michpal column headers.

---

### 9. No Webhook / Integration API for Schedule Changes

**File:** `.env.example` — integrations listed: Supabase, Redis, Stripe, WhatsApp, FAL (AI), Anthropic

There is no outbound webhook system for schedule changes (shift assigned, schedule published, etc.). The `ScheduleEvent` model in the schema does log `DomainEventType` events (line 149), but there is no mechanism to push these to external systems (POS, HRMS, time-clock systems).

For enterprise chains, we need to push published schedules to our time-clock system (Synel) and our POS system (Priority). Currently, these integrations would require polling or manual export.

**Effort to fix:** Large — requires an outbound webhook registration system, retry logic, and HMAC signing.

---

### 10. Shabbat Premium Calculation Is Informational Only

**File:** `src/modules/payroll/payroll.service.ts` lines 178–183, 219–221

The Shabbat premium logic is correct in principle — it correctly identifies Fri 18:00–Sat end as Shabbat time and adds a 0.5× multiplier top-up. However:

1. The `weekendHours` column is labeled "informational" in comments — the gross calculation adds `weekendH * rate * (SHABBAT_MULTIPLIER - 1)`, which means Shabbat hours are counted twice in gross (once in `regularHours`/OT tiers, once in the Shabbat delta). This is correct for total pay, but it makes the CSV confusing: the `שעות שבת` column does not equal "pure Shabbat-only pay" — you need to know how to interpret it.

2. The 15-minute slice approach for Shabbat detection (line 75–93) is CPU-intensive. For 100 employees × 40 shifts each = 4,000 shifts, each shift can have up to 96 slices. That's **384,000 iterations** on payroll export. Acceptable today, but will be slow at scale.

**Effort to fix for item 1:** Documentation/UI clarification (small). For item 2: Replace slice loop with mathematical interval intersection (small, ~1 hour).

---

## Database / Performance Concerns

### Missing Index: `shifts.organizationId + locationId`

**File:** `prisma/schema.prisma` lines 522–526

Existing indexes on `shifts`:
```prisma
@@index([organizationId, startAtUtc])
@@index([scheduleId])
@@index([roleId, startAtUtc])
```

There is no `@@index([organizationId, locationId])` or `@@index([locationId, startAtUtc])`. For a 5-branch chain running location-filtered queries on shifts (which will be the most common query pattern), every location-scoped query does a full org-level scan filtered in memory.

### Missing Index: `schedules.organizationId + locationId + status`

**File:** `prisma/schema.prisma` lines 458–460

Existing indexes:
```prisma
@@index([organizationId, periodStartDate])
@@index([locationId, status])
```

The `[locationId, status]` index is missing `organizationId` — without it, a query for `WHERE organizationId = $1 AND locationId = $2 AND status = 'PUBLISHED'` cannot use this index efficiently (it can only use the org index, then filter on locationId in memory).

### `persistCandidates` Uses Serial Upserts in a Loop

**File:** `src/modules/scheduler/candidate-generation.service.ts` lines 154–168

```typescript
for (const r of rows) {
  await tx.schedulingCandidate.upsert({ ... });
}
```

For 17,500 candidates, this is 17,500 sequential upsert statements inside a single transaction. Should use Prisma's `createMany` with `skipDuplicates` or a raw `INSERT ... ON CONFLICT DO UPDATE`.

### RLS Is Partially Applied

**File:** `src/modules/admin/admin.routes.ts` lines 1137–1157

RLS is applied to 6 tables (`organizations`, `memberships`, `locations`, `roles`, `employees`, `schedules`, `shifts`). However it is NOT applied to:
- `shift_assignments`
- `employee_time_off_requests`
- `employee_availability_rules`
- `rule_violations`
- `schedule_audit_logs`
- `shift_swap_requests`

A tenant with direct DB access (e.g., via the `req.orgPrisma` wrapper with a mis-set `current_org_id`) could query another tenant's violations or assignments. The `apply-schema-migrations` endpoint (`admin.routes.ts` line 1124) also has **no auth guard** at all — any unauthenticated caller can trigger schema changes:

```typescript
app.post('/apply-schema-migrations', async (_req, _reply) => {
```

---

## Security Concerns

### CRITICAL: `/v1/admin/apply-schema-migrations` Has No Authentication

**File:** `src/modules/admin/admin.routes.ts` line 1124

```typescript
app.post('/apply-schema-migrations', async (_req, _reply) => {
```

This route runs raw DDL statements against the production database with no `preHandler: auth` guard and no `ensureAdmin` check. Anyone who discovers this endpoint can run `ALTER TABLE` statements on the production DB. This is a critical vulnerability.

### `/v1/admin/db-info` Has No Authentication

**File:** `src/modules/admin/admin.routes.ts` line 1189

```typescript
app.get('/db-info', async (_req, _reply) => {
```

Returns database hostname, project ref, organization names, schema column lists, and auth user count — all unauthenticated. An attacker performing reconnaissance on `https://sidor-api.vercel.app/v1/admin/db-info` gets the Supabase project reference and organization sample data for free.

### `AUTH_DISABLED=true` Bypasses All Security

**File:** `src/modules/reads/reads.routes.ts` lines 40–44, `src/modules/employees/employees.routes.ts` line 68

Multiple routes check `process.env['AUTH_DISABLED'] === 'true'` and skip authentication entirely. If this env var is accidentally set in production (or left from a deploy), the entire API is publicly accessible. There is no build-time assertion that `AUTH_DISABLED` is `false` in production.

### Platform Admin Email Is Hardcoded in `.env.example`

**File:** `.env.example` line 34

```
PLATFORM_ADMIN_EMAILS="eliranabu320@gmail.com"
```

The default value for the platform admin allowlist is a real developer email. Any deployment that uses the `.env.example` as a starting point without changing this line grants platform-admin (RLS-bypassing) access to that email address.

---

## Competitive Comparison Notes

| Feature | sidor4S | Deputy (competitor) | Homebase (competitor) |
|---|---|---|---|
| Multi-location support | Partial (locations exist, no per-location managers) | Full | Full |
| Branch manager role | No | Yes | Yes |
| Bulk CSV import | Text only | CSV + XLSX | CSV |
| Payroll export | Hilan (Hebrew only) | Multiple formats | Multiple formats |
| Mobile app | No (web only) | iOS + Android | iOS + Android |
| Employee self-service | No (manager only) | Yes | Yes |
| Webhook / integrations | WhatsApp only | Zapier, REST API | Limited |
| IL labor law compliance | Yes (strong) | No (US-only) | No (US-only) |
| Hebrew RTL UI | Yes (full) | No | No |
| Shabbat premium calc | Yes | No | No |
| Youth labor rules | Yes | No | No |

**sidor4S's genuine advantages:** IL-specific compliance (youth curfew, 36h weekly rest, break rules, Shabbat premium, Hilan export) and Hebrew RTL UI are not available in any English-language competitor. For an Israeli coffee chain, this is a meaningful differentiator. No competitor handles `weeklyRestDay` per employee or the `break-45min` rule correctly.

**sidor4S's competitive gap:** For a 5-branch chain, the absence of branch-manager roles and multi-location employee assignment is a deal-breaker that Deputy and Homebase both handle out of the box.

---

## Recommended Development Roadmap (Priority Order)

1. **[Security — 1 week]** Add `preHandler: auth + ensureAdmin` to `/v1/admin/apply-schema-migrations` and `/v1/admin/db-info`. Add production guard for `AUTH_DISABLED`.

2. **[Critical — 3–4 weeks]** Add `BRANCH_MANAGER` role with location-scoped visibility. This unlocks the entire multi-branch use case.

3. **[Critical — 1 week]** Add `locationId` filter to payroll export. Add `idNumber` (תעודת זהות) field to `Employee` schema with UI.

4. **[Performance — 2 weeks]** Fix N+1 on employees page (bulk availability/preferences endpoint). Add pagination to `/v1/employees`. Replace serial upsert loop in `persistCandidates` with batch insert.

5. **[Performance — 1 week]** Add database indexes: `shifts(organizationId, locationId)`, `schedules(organizationId, locationId, status)`. Add location pre-filter in candidate generation to cap the matrix.

6. **[Feature — 2–3 weeks]** Employee multi-location assignment (junction table + UI).

7. **[Feature — 2 weeks]** CSV/XLSX bulk import with column mapping and per-row validation.

8. **[Feature — 1 week]** Cross-branch analytics dashboard (location breakout in labor cost + fairness).

9. **[Feature — 1 week]** Michpal payroll export format.

10. **[Feature — 4–6 weeks]** Outbound webhook system for schedule events (for POS/time-clock integration).

---

*Analysis performed against commit `c5c2021` on branch `main`, 2026-05-24.*
