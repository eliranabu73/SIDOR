# Build Verification Report — 2026-05-24

## Summary
The codebase is in a clean, healthy state. All tests pass, TypeScript compiles without errors, and the frontend builds successfully.

---

## Test Results

**Command:** `node --experimental-vm-modules node_modules/jest/bin/jest.js --passWithNoTests`

- **32 test suites**, all passing
- **190 tests passing**, 2 skipped, 0 failing

### Important note on `npx jest` vs `npm test`
Running `npx jest` directly (without `--experimental-vm-modules`) causes 3 tests in `tests/share/export.service.test.ts` to fail with:

```
TypeError: A dynamic import callback was invoked without --experimental-vm-modules
```

This is **not a regression** — the `npm test` script in `package.json` already includes the flag correctly:

```json
"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js"
```

The `png-renderer.ts` uses `new Function('s', 'return import(s)')` to escape Jest's CJS module rewriting for ESM-only packages (satori, @resvg/resvg-js). This requires `--experimental-vm-modules` to work correctly in Jest. Always use `npm test` (not `npx jest`) to run the test suite.

---

## TypeScript Compilation

**Command:** `npx tsc --noEmit`

- **0 errors found**
- Compilation exits clean with no output

---

## Frontend Build (Next.js)

**Command:** `npm run build` (in `web/`)

- **Build successful** — compiled in 4.5s
- TypeScript check passed
- 45 static pages generated
- No errors or warnings (aside from expected "edge runtime disables static generation" for one route)

Routes are correctly categorized as Static, SSG, and Dynamic (server-rendered).

---

## Known Risk Area Checks

### A. Rule tests — `tests/rules/validator.test.ts`
PASS — Employee mock is complete. No missing required fields.

### B. Greedy scheduler tests — `tests/scheduler/greedy.test.ts`
PASS — Employee mock matches schema. OR-Tools comparison test also passes.

### C. Import paths
No broken `@/` imports found. All routes/services compile and import correctly.

### D. Prisma client
`npx tsc --noEmit` passes without needing `prisma generate`, which means the generated client is already up to date with the schema.

### E. `src/modules/payroll/payroll.service.ts`
Code is correct. Hilan export row construction uses proper OT multipliers (1.25x, 1.5x) and Shabbat detection logic. No obvious runtime bugs.

### F. `src/modules/employees/employees.routes.ts`
All recent constraint-management additions compile and look correct. The `dbFor`/`orgIdFor` pattern is consistent.

### G. `src/modules/share/poster.routes.ts`
PNG generation route is clean. The `buildOrigin` helper correctly handles forwarded headers for Vercel/CF. Token minting validates schedule ownership before signing.

---

## Files Changed
None. No fixes were required — the codebase was already in a passing state.

---

## Issues That Could Not Be Fixed
None. The only "failure" observed (3 export tests) is a test-runner invocation issue, not a code bug — and it resolves completely when running via `npm test`.

---

## Deprecation Warnings (Non-Blocking)
- `ts-jest` `isolatedModules` config option is deprecated — will be removed in ts-jest v30. Low priority.
- Fastify `request.routerPath` is deprecated — use `request.routeOptions.url` instead. Low priority; affects test output only.
