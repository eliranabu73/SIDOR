# Integration Tests

Real Postgres (Supabase `test` schema) integration tests for `assignments.service.ts`.

## Prerequisites

1. `.env` must contain `TEST_DATABASE_URL` pointing to the test schema:
   ```
   TEST_DATABASE_URL="postgresql://postgres:<PWD>@db.lpnqyzlfsosdxnykaaer.supabase.co:5432/postgres?schema=test"
   ```
2. Leave `REDIS_URL` **unset** (or empty). The lock service automatically falls
   back to the in-memory shim; no Redis instance is required.

## Running

```bash
npx jest --config jest.integration.config.ts
```

Or, once the orchestrator adds the npm script:

```bash
npm run test:integration
```

## What is tested

| # | Test | Scenario |
|---|------|----------|
| 1 | Happy path | Assign succeeds → version 1→2, ShiftAssignment CONFIRMED, metrics row, audit log, domain event |
| 2 | VERSION_MISMATCH | Stale `expectedShiftVersion` → `ConflictError { code: 'VERSION_MISMATCH' }` |
| 3 | SHIFT_LOCKED | Another user holds the soft lock → `ConflictError { code: 'SHIFT_LOCKED' }` |
| 4 | CONSTRAINTS_VIOLATED | Employee missing required role → `ValidationFailedError { code: 'CONSTRAINTS_VIOLATED' }`, violations contain `ROLE_NOT_HELD` |
| 5 | WARNINGS_REQUIRE_ACK | 10-hour shift triggers daily overtime warning; without ack → error; with ack → success + `RuleViolation` row |
| 6 | Concurrent double-PATCH | Two `Promise.allSettled` callers with same `expectedShiftVersion:1` → exactly one fulfills, the other gets `VERSION_MISMATCH` |
| 7 | Metrics delta | Two shifts in same week → `shiftCount=2`, `totalScheduledMinutes` is the sum, night/morning counters classified by local hour |
| bonus | validateOnly dry-run | No side-effect rows written, shift version unchanged |

## Design notes

- **Isolation without truncation**: each test calls `seedHappyShift` which
  creates a fresh UUID for `organizationId`. All rows are scoped to that org
  so tests never see each other's data.
- **In-memory Redis**: `__resetRedis()` is called in `beforeEach` to clear
  any locks left from the previous test.
- **Serial execution**: `jest.integration.config.ts` sets `maxWorkers: 1`.
  Prisma's `$transaction` with `SELECT … FOR UPDATE` serialises concurrent
  writes within a test, but running tests in parallel across workers would
  create cross-test interference on shared Postgres connections.

## Known limitations / TODOs

- **`applyAssignment` uses the default Prisma singleton** (`src/db/prisma.ts`)
  as its fallback. The tests pass a test-schema `PrismaClient` instance
  explicitly as the second argument, which works because the service accepts
  `prisma?: PrismaClient`. However, the `LocksService` (Redis) and
  `publishEvent` (post-commit Redis publish) are module-level singletons
  without DI. If you later want to swap those in tests without the
  `__resetRedis` escape hatch, consider accepting them via a context/options
  object in `applyAssignment`.
- **`publishEvent` post-commit**: the in-memory Redis shim's `publish` is a
  no-op, so domain events are not forwarded to any channel during tests. This
  is intentional — channel subscribers are an integration concern for a
  separate test tier (e.g. E2E with a real Redis).
- **`globalThis.__prisma` cache**: `src/db/prisma.ts` stores the client on
  `globalThis`. When running with `ts-jest`, if the module is evaluated before
  `DATABASE_URL` is overridden by `jest.integration.config.ts`, the singleton
  could connect to the wrong DB. The tests avoid this by always passing the
  explicit `prisma` argument. If a future test omits the argument, ensure
  `DATABASE_URL` is set _before_ any worker module evaluation.
