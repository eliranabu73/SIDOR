# Israeli Tip Law 2022 — Implementation Report
**Date:** 2026-05-24  
**Branch:** main  
**TypeScript errors after implementation:** 0

---

## Summary

Full implementation of חוק הטיפים 2022 (Amendment 19 to the Minimum Wage Law).  
Tips collected from customers are distributed proportionally to service-role employees  
who worked on the shift date. The amount appears in the monthly payroll CSV export.

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/modules/tips/tips.service.ts` | 316 | Business logic: calculate distribution, record pool, fetch history |
| `src/modules/tips/tips.routes.ts` | 210 | Fastify routes: POST/GET/DELETE /v1/tips, GET /v1/tips/preview |
| `prisma/migrations/20260524230000_tip_law_2022/migration.sql` | 66 | DDL for tip_pools + tip_distributions tables with RLS |
| `web/app/tips/page.tsx` | 508 | Manager UI: date/amount entry, live preview, history with expand/delete |

---

## Files Modified

| File | Lines after | Changes |
|------|-------------|---------|
| `prisma/schema.prisma` | 850 | Added `TipPool`, `TipDistribution` models; back-relations on `Organization`, `Location`, `Employee` |
| `src/modules/payroll/hilan-adapter.service.ts` | 81 | Added `tipsAgorot: number` to `PayrollRow`; added `טיפים (ש״ח)` column to both Hilan and Standard CSV headers + row formatters |
| `src/modules/payroll/payroll.service.ts` | 313 | Added `tipsAgorot` accumulator; fetches `tipDistribution` records for the period and sums per employee |
| `src/app.ts` | 143 | Imports `tipsRoutes`; registers under `/v1` prefix |
| `web/components/layout/AppShell.tsx` | 159 | Imports `CircleDollarSign`; adds `/tips` nav item (desktop + mobile); mobile grid updated to `grid-cols-6` |
| `web/lib/api.ts` | 1382 | Added `TipDistributionItem`, `TipPoolItem`, `TipDistributionPreview`, `TipPreviewResponse`, `RecordTipBody` types; `previewTipDistribution`, `fetchTipPools`, `recordTipPool`, `deleteTipPool` functions |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/tips` | Record a new tip pool + auto-calculate distributions |
| `GET` | `/v1/tips` | List tip pools by `?periodStart=&periodEnd=` |
| `GET` | `/v1/tips/preview` | Preview distribution without saving (used by UI) |
| `GET` | `/v1/tips/:id` | Single pool with full distribution detail |
| `DELETE` | `/v1/tips/:id` | Delete pool (correction/undo) |

---

## Key Business Rules Implemented

### 1. Service-role filtering
A role is tip-eligible if its name contains any of:  
`מלצר`, `מלצרית`, `ברמן`, `ברמנית`, `קופאי`, `קופאית`, `שירות`, `service`, `waiter`, `waitress`, `bartender`, `cashier`

Non-service employees (e.g. kitchen staff, managers) are excluded from all calculations.

### 2. Proportional distribution
```
employee_share = floor((employee_minutes / total_minutes) * totalAgorot)
```
Remainder agorot (due to floor rounding) are added to the employee with the most minutes worked.

### 3. Integer-only money
All amounts stored and calculated in **agorot** (integer). Division to shekel (÷100) only happens at serialization (CSV, UI display). No floating-point arithmetic on monetary values.

### 4. Payroll CSV integration
Both Hilan and Standard CSV exports now include a `טיפים (ש״ח)` column showing the sum of all tip distributions for the employee in the payroll period. The column is `0.00` for non-service employees with no distributions.

### 5. Same-period constraint
The payroll export queries `tipDistribution` records where the parent `tipPool.shiftDate` falls within `[periodStart, periodEnd]` — matching the same period as the shifts.

---

## Schema (Prisma)

```prisma
model TipPool {
  id              String    @id @default(uuid()) @db.Uuid
  organizationId  String    @db.Uuid
  shiftDate       DateTime  @db.Date
  locationId      String?   @db.Uuid
  totalAgorot     Int       // total tips in agorot
  note            String?
  createdAt       DateTime  @default(now())
  createdByUserId String?   @db.Uuid
  distributions   TipDistribution[]
}

model TipDistribution {
  id           String   @id @default(uuid()) @db.Uuid
  tipPoolId    String   @db.Uuid
  employeeId   String   @db.Uuid
  shiftMinutes Int
  amountAgorot Int
  @@unique([tipPoolId, employeeId])
}
```

Both tables have RLS enabled with tenant-isolation policies consistent with the rest of the schema.

---

## UI Flow

1. Manager opens **חלוקת טיפים** (new nav item, coin icon)
2. Selects date, optional branch, enters ₪ amount
3. Clicks **חשב חלוקה** — calls `GET /v1/tips/preview` → shows table of employees with minutes worked and their calculated share
4. Clicks **שמור חלוקה** — calls `POST /v1/tips` → persists pool + distributions
5. History section below shows all pools for the current month with expand/delete

---

## Next Steps (not in scope of this sprint)

- Run `prisma migrate deploy` against staging DB to activate the new tables
- Run `prisma generate` to regenerate the Prisma client (removes the `any` casts)
- Add employee-facing tip notification (WhatsApp) when distribution is recorded
- Add tip totals to the employee detail page (`/employees/:id`)
