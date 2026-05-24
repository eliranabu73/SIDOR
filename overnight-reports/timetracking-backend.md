# Time Tracking Backend — שעון נוכחות
**Date:** 2026-05-24  
**Sprint:** v2.0 — Sprint 5  

---

## Files Created

| File | Description |
|------|-------------|
| `prisma/migrations/20260524240000_time_tracking/migration.sql` | DDL: CREATE TABLE time_entries, indexes, partial index for open entries, RLS policy |
| `src/modules/timetracking/timetracking.service.ts` | Core service: clockIn, clockOut, getOpenEntry, listEntries, patchEntry, computeActualMinutes |
| `src/modules/timetracking/timetracking.routes.ts` | Fastify routes (JWT + HMAC share-token) |

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `TimeEntry` model; added `timeEntries TimeEntry[]` back-relations on `Employee` and `Organization` |
| `src/app.ts` | Imported and registered `timetrackingRoutes` with `/v1` prefix |
| `src/modules/payroll/hilan-adapter.service.ts` | Added `actualMinutes` and `scheduledMinutes` to `PayrollRow` interface; added "שעות בפועל" / "שעות מתוכננות" columns to both Hilan and Standard CSV headers/row adapters |
| `src/modules/payroll/payroll.service.ts` | Imported `computeActualMinutes`; added `scheduledMinutes` accumulator to `AggregateAccumulator`; fetches `time_entries` per employee in period; uses `billableMinutes = actualMinutes > 0 ? actual : scheduled` for overtime tier recalculation |

---

## API Endpoints

### JWT-authenticated (manager / employee session)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/timetracking/clock-in` | Clock in. Body: `{ shiftAssignmentId?, lat?, lng?, note? }`. 409 if already clocked in. |
| POST | `/v1/timetracking/clock-out` | Clock out. Body: `{ lat?, lng? }`. 409 if not clocked in. |
| GET | `/v1/timetracking/status` | Returns `{ clockedIn: bool, entry: TimeEntry | null }` |
| GET | `/v1/timetracking/entries` | Query: `from`, `to` (ISO datetime), optional `employeeId`. Manager view with employee name. |
| PATCH | `/v1/timetracking/entries/:id` | Manager correction. Body: `{ clockInAt?, clockOutAt?, note? }`. Sets `source = 'manager_edit'`. |

### HMAC share-token (employee self-service, no JWT)

Token verified via `verifyEmployeeToken(token)` from `share.service.ts`. Must have `intent = 'employee_portal'`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/timetracking/token/:token/clock-in` | Employee clocks in via portal link |
| POST | `/v1/timetracking/token/:token/clock-out` | Employee clocks out via portal link |
| GET | `/v1/timetracking/token/:token/status` | Current clock state for the token's employee |

---

## Payroll Integration

- `generatePayrollExport` now fetches `time_entries` for all employees in the period after aggregating scheduled shifts.
- Overtime tiers (regular / 125% / 150%) are **recalculated from billable minutes** — not just from scheduled shift durations.
- Billable minutes = actual punched minutes when > 0, otherwise scheduled minutes (graceful fallback for orgs not yet using the punch clock).
- CSV output gains two new columns: **שעות בפועל** (actual) and **שעות מתוכננות** (scheduled) so payroll can spot discrepancies.
- `PayrollRow.actualMinutes` and `PayrollRow.scheduledMinutes` are also exposed in the `rawRows` array (JSON API response) for the frontend attendance dashboard.

---

## Schema Notes

```
time_entries
  id                UUID PK
  organizationId    UUID NOT NULL → organizations(id) CASCADE
  employeeId        UUID NOT NULL → employees(id) CASCADE
  shiftAssignmentId UUID NULL (informational — no FK, assignment may be deleted)
  clockInAt         TIMESTAMPTZ NOT NULL
  clockOutAt        TIMESTAMPTZ NULL  ← NULL = currently clocked in
  clockInLat/Lng    FLOAT NULL
  clockOutLat/Lng   FLOAT NULL
  note              TEXT NULL
  source            TEXT DEFAULT 'employee'  ('employee' | 'manager_edit')
  createdAt         TIMESTAMPTZ DEFAULT now()
```

Indexes:
- `(organizationId, employeeId)` — list/status queries
- `(organizationId, clockInAt)` — period range queries for payroll
- Partial index `WHERE clockOutAt IS NULL` — fast "find open entry" check on every punch

RLS: `time_entries_org_isolation` policy via `app.current_org_id` session variable (same pattern as all other tables).

---

## TODOs / V2 Edge Cases

1. **Weekend premium recalculation**: The Shabbat-minutes window (`weekendMin`) is still computed from scheduled shift windows, not from the actual punch window. For accuracy it should be recomputed using `clockInAt`/`clockOutAt` from the time entries.
2. **Break deduction**: Unpaid breaks (e.g. mandatory 30-min meal break) are not yet deducted from actual minutes. Add a `breakMinutes` column or a separate `time_entry_breaks` table.
3. **Daily vs. cumulative OT**: Current OT logic applies tiers per-shift-day based on scheduled minutes; when actual punches span midnight the tier logic may miscount. For strict IL compliance, accumulate per calendar day.
4. **Manager/employee role separation**: The JWT routes currently derive `employeeId` from `req.user.employeeId`. Confirm the auth plugin sets this field, or add a `GET /v1/employees/me` lookup as fallback.
5. **Push notifications**: When an employee clocks in/out, consider emitting a `ScheduleEvent` (domain event) so the real-time gateway can notify the manager.
6. **Audit trail**: `patchEntry` sets `source = 'manager_edit'` but does not write a `ScheduleAuditLog` row. Add one for full audit compliance.
7. **Clock-in within shift window**: Optionally auto-link `shiftAssignmentId` by finding the closest upcoming/active `ShiftAssignment` if the employee doesn't pass one.
