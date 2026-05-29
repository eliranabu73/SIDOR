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
  // eslint-disable-next-line no-var
  var __txPrisma: PrismaClient | undefined;
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

/**
 * Builds a Prisma client for interactive transactions (withOrgContext /
 * withAdminContext). Prisma Accelerate does NOT support interactive
 * transactions (`$transaction(async cb)`) because they hold a real Postgres
 * connection open across round-trips, which the proxy cannot facilitate.
 *
 * When DIRECT_URL is set (always in production — it is the raw Supabase
 * connection string), this client connects directly, bypassing Accelerate.
 * This lets SET LOCAL work correctly inside a real Postgres transaction.
 */
function makeTxPrisma(): PrismaClient {
  const directUrl = process.env['DIRECT_URL'];
  if (directUrl) {
    return new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      datasourceUrl: directUrl,
    });
  }
  // Fallback: no DIRECT_URL set (local dev without split URLs) — reuse main client.
  // In this case DATABASE_URL is already a direct Postgres URL, so $transaction works.
  return makePrisma();
}

export const prisma: PrismaClient = globalThis.__prisma ?? makePrisma();
/** Direct-connection client used exclusively for RLS-context transactions. */
const txPrisma: PrismaClient = globalThis.__txPrisma ?? makeTxPrisma();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
  globalThis.__txPrisma = txPrisma;
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
 * Returns a wrapper around `prisma.$transaction` that lets RLS policies
 * see an admin wildcard for `app.current_org_id`. Use this ONLY in routes
 * gated by `isPlatformAdmin()`.
 *
 * Implementation: each tenant_isolation policy recognises the literal
 * sentinel `'*'` and matches all rows when the GUC is set to it (see
 * migration 20260525170000_admin_rls_bypass). Setting `row_security = off`
 * was the prior approach — it does the OPPOSITE of bypass (causes 42501
 * unless the role has BYPASSRLS), so it was removed.
 */
export const ADMIN_ORG_SENTINEL = '*';

export function withAdminContext() {
  return {
    query<T>(queryFn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      // Use txPrisma (direct connection) — Prisma Accelerate doesn't support
      // interactive transactions required for SET LOCAL.
      return txPrisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SET LOCAL app.current_org_id = '${ADMIN_ORG_SENTINEL}'`,
        );
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
     * batch endpoints that issue many sequential writes.
     *
     * Uses `txPrisma` (direct Supabase connection via DIRECT_URL) to avoid
     * Prisma Accelerate's lack of interactive-transaction support. Regular
     * reads/writes on `prisma` continue to use Accelerate for connection pooling.
     */
    query<T>(queryFn: (tx: PrismaClient) => Promise<T>): Promise<T> {
      return txPrisma.$transaction(
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
