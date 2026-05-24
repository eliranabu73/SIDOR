# BRANCH_MANAGER Role — Implementation Report
Date: 2026-05-24

## Summary
Added a `BRANCH_MANAGER` role that restricts a user to only see and edit schedules, employees, and payroll belonging to their assigned location. No existing `OWNER`/`MANAGER` flows were broken — all changes are additive.

---

## Files Changed

### 1. `prisma/schema.prisma`
- Added `BRANCH_MANAGER` to `MembershipRole` enum.
- Added optional `locationId String? @db.Uuid` + `location Location?` relation to `Membership` model — only set when `role = BRANCH_MANAGER`.
- Added `memberships Membership[]` back-relation to `Location` model.

### 2. `prisma/migrations/20260524220000_branch_manager_role/migration.sql` (NEW)
- `ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'BRANCH_MANAGER'`
- `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "locationId" UUID`
- Adds FK `memberships_locationId_fkey → locations(id) ON DELETE SET NULL` inside a DO block to be idempotent.

### 3. `src/modules/auth/types.ts`
- Added `locationId?: string | null` to the `FastifyRequest.user` interface.

### 4. `src/modules/auth/jwt-verifier.ts`
- Added `locationId?: string | null` to the `VerifiedUser` interface.

### 5. `src/modules/auth/auth.plugin.ts`
- **DB-fallback path** (no orgId in JWT): now also selects `locationId` from the `Membership` row and sets it on `req.user`.
- **Fast path** (orgId in JWT): added a second membership lookup to always load `locationId` and re-sync `role` from the DB (ensures a freshly-changed role is picked up without requiring a new JWT).
- Uses `(prisma.membership as any)` cast to compile before `prisma generate` runs.

### 6. `src/shared/location-scope.ts` (NEW)
Three pure helpers (no DB access):
- `locationScope(user)` → `{ locationId?: string }` — for Schedule/Shift queries.
- `employeeLocationScope(user)` → `{ defaultLocationId?: string }` — for Employee queries.
- `isBranchManager(user)` → `boolean` — for imperative checks.
Both role casings (`branch_manager` / `BRANCH_MANAGER`) are handled.

### 7. `src/modules/reads/reads.routes.ts`
- **`GET /v1/employees`**: spreads `employeeLocationScope(req.user)` into the `where` clause — BRANCH_MANAGER only sees employees whose `defaultLocationId` matches their scope.
- **`GET /v1/schedules/:scheduleId`**: spreads `locationScope(req.user)` into all three schedule lookup branches (direct UUID, weekStart, fallback) — BRANCH_MANAGER cannot fetch a schedule from a different location.

### 8. `src/modules/scheduler/scheduler.routes.ts`
- Added `GET /v1/schedules` list endpoint with `locationScope` applied to `where`. Supports an optional `?status=` filter.
- OWNER/MANAGER see all schedules; BRANCH_MANAGER sees only their location's schedules.

### 9. `src/modules/employees/employees.routes.ts`
- **`GET /v1/employees/summary`**: spreads `employeeLocationScope(req.user)` — BRANCH_MANAGER only sees their location's employees in the constraint-count summary view.

### 10. `src/modules/payroll/payroll.routes.ts`
- **`GET /v1/payroll/export.csv`**: when `isBranchManager(req.user)` is true, forces `locationId` to the user's scoped location, ignoring the query-string value. OWNER/MANAGER can still pass any `locationId` (or none).

### 11. `src/modules/settings/settings.routes.ts`
- **`GET /v1/settings/members`** (NEW, OWNER only): returns all non-deactivated memberships with `role`, `locationId`, and the resolved location `{ id, name }`.
- **`PATCH /v1/settings/members/:userId/role`** (NEW, OWNER only): updates `role` to `MANAGER` or `BRANCH_MANAGER` and sets/clears `locationId`. Prevents the owner from demoting themselves.

### 12. `web/lib/api.ts`
- Added `MembershipRole` type, `OrgMember` interface.
- Added `fetchOrgMembers()` → `GET /v1/settings/members`.
- Added `patchMemberRole(userId, role, locationId?)` → `PATCH /v1/settings/members/:userId/role`.

### 13. `web/components/settings/MembersTable.tsx` (NEW)
- Fetches members + locations in parallel.
- Displays a table with role badges: OWNER=indigo, MANAGER=blue, BRANCH_MANAGER=teal.
- Edit mode: inline `<select>` for role, conditional location dropdown when BRANCH_MANAGER is chosen.
- Guards: OWNER row has no edit button; validation requires a location before saving BRANCH_MANAGER.

### 14. `web/app/settings/MembersTab.tsx` (NEW)
- Thin wrapper around `MembersTable` with a section header and an info banner (Hebrew).

### 15. `web/app/settings/page.tsx`
- Added `"members"` to the `Tab` union and the `TABS` array (`הרשאות צוות`, `Users` icon).
- Lazy-loads `MembersTab` via `dynamic()`.
- Renders the tab panel when `tab === "members"`.

---

## How to Apply

1. Run the migration against your Supabase DB:
   ```
   npx prisma migrate deploy
   ```
   or apply `prisma/migrations/20260524220000_branch_manager_role/migration.sql` directly.

2. Regenerate the Prisma client (removes the `any` casts):
   ```
   npx prisma generate
   ```
   After generation, remove the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments and the `as any` casts in `auth.plugin.ts` and `settings.routes.ts` — the typed methods will be available.

3. Deploy the updated backend and frontend.

---

## Testing

To create a BRANCH_MANAGER test user:
1. Create a user in Supabase Auth and invite them to the org.
2. As OWNER, go to `/settings` → tab "הרשאות צוות".
3. Click the edit button next to their row, choose "מנהל סניף", pick a location, save.
4. Log in as that user — they should only see schedules and employees for their location.

Alternatively, run this SQL directly:
```sql
UPDATE memberships
SET role = 'BRANCH_MANAGER', "locationId" = '<your-location-uuid>'
WHERE "userId" = '<target-user-uuid>';
```

---

## Constraints Not Modified
- OWNER/MANAGER membership rows are unaffected — `locationId` stays NULL.
- All existing routes not listed above are unchanged.
- No seed file was modified (no seed file exists in the repo).
