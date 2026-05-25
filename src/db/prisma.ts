import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Union of full Prisma client and a transaction client.  Service-layer
 * functions accept this so they can run either standalone (using the global
 * client) or be composed inside a caller-managed transaction (e.g. one
 * opened by `withOrgContext.query()` for RLS isolation).
 */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Run `fn` inside a transaction.  If `db` is already a transaction client
 * (no `$transaction` method) we reuse it instead of nesting — Prisma does
 * not support nested `$transaction`s and doing so would lose the outer
 * `SET LOCAL app.current_org_id` context.
 */
export async function ensureTx<T>(
  db: Db,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if ('$transaction' in db && typeof (db as PrismaClient).$transaction === 'function') {
    return (db as PrismaClient).$transaction(fn);
  }
  return fn(db as Prisma.TransactionClient);
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Builds a Prisma client — standard in dev/local, with Accelerate extension
 * in production when DATABASE_URL is a `prisma://` URL (avoids IPv6 issues
 * with Vercel Lambda which has no IPv6 egress to Supabase).
 */
function makePrisma(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  if (process.env.DATABASE_URL?.startsWith('prisma://') || process.env.DATABASE_URL?.startsWith('prisma+postgres://')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { withAccelerate } = require('@prisma/extension-accelerate') as typeof import('@prisma/extension-accelerate');
    return base.$extends(withAccelerate()) as unknown as PrismaClient;
  }
  return base;
}

export const prisma: PrismaClient = globalThis.__prisma ?? makePrisma();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// ---------------------------------------------------------------------------
// RLS context helper — TASK 2 (WS-5d)
// ---------------------------------------------------------------------------
/**
 * Returns a thin wrapper around `prisma.$transaction` that prepends a
 * `SET LOCAL app.current_org_id = '<orgId>'` statement before executing the
 * caller-supplied queries inside a single Postgres transaction.
 *
 * This satisfies the Row Level Security policy:
 *
 *   CREATE POLICY tenant_isolation ON "employees"
 *     USING (organization_id::text = current_setting('app.current_org_id', true));
 *
 * Chosen approach: explicit `$transaction` wrapper rather than a Prisma
 * `$extends` middleware.  The `$extends` middleware API does not expose a
 * per-query hook that runs inside the *same* transaction as the query being
 * intercepted, so we cannot safely use `SET LOCAL` there (LOCAL is
 * transaction-scoped in Postgres; outside a transaction it behaves like SET
 * SESSION which would leak across connection-pool reuse).
 *
 * Migration path for other routes: replace direct `prisma.foo.findMany(…)`
 * calls with:
 *
 *   const db = withOrgContext(req.user!.orgId);
 *   const employees = await db.query((tx) => tx.employee.findMany(…));
 *
 * POC wired up in: GET /v1/employees (reads.routes.ts).
 *
 * @example
 *   const db = withOrgContext(orgId);
 *   const result = await db.query((tx) => tx.employee.findMany({ ... }));
 */
// ---------------------------------------------------------------------------
// Platform-admin context — bypasses RLS for cross-tenant queries.
// ---------------------------------------------------------------------------
/**
 * Returns a wrapper around `prisma.$transaction` that disables RLS for the
 * duration of the transaction via `SET LOCAL row_security = off`.
 *
 * Use this ONLY in routes that are gated by `isPlatformAdmin()`. RLS is
 * still enforced for any non-admin caller.
 *
 * Postgres semantics:
 *   - `SET LOCAL` is transaction-scoped and reverts at COMMIT/ROLLBACK.
 *   - Disabling `row_security` causes RLS policies to be skipped for the
 *     current role inside this transaction.
 *
 * @example
 *   const db = withAdminContext();
 *   const orgs = await db.query((tx) => tx.organization.findMany());
 */
export function withAdminContext() {
  return {
    query<T>(queryFn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL row_security = off`);
        return queryFn(tx as unknown as PrismaClient);
      });
    },
  };
}

export function withOrgContext(
  orgId: string,
  opts?: { timeout?: number; maxWait?: number },
) {
  return {
    /**
     * Run `queryFn` inside a transaction that first sets the RLS context.
     * `queryFn` receives a `PrismaClient` scoped to the transaction.
     * Pass opts.timeout (ms) to override the default 5 s Prisma cap, e.g. for
     * batch endpoints that issue many sequential writes. Accelerate enforces
     * a hard 15 s max — do not exceed it.
     */
    query<T>(queryFn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return prisma.$transaction(
        async (tx) => {
          // SET LOCAL only affects the current transaction (connection-pool safe).
          // We sanitise orgId to a UUID pattern to prevent SQL injection.
          const safeOrgId = orgId.replace(/[^a-f0-9-]/gi, '');
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_org_id = '${safeOrgId}'`,
          );
          return queryFn(tx as unknown as PrismaClient);
        },
        opts ? { timeout: opts.timeout, maxWait: opts.maxWait } : undefined,
      );
    },
  };
}
