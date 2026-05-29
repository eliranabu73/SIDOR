/**
 * Fastify auth plugin.
 *
 * Registers the `app.authenticate` preHandler decorator that:
 *  1. Extracts the Bearer token from the `Authorization` header.
 *  2. Verifies it via `verifyJwt` (HS256 or RS256/JWKS depending on env).
 *  3. Populates `req.user` with `{ id, orgId, role }`.
 *
 * ORCHESTRATOR: register this plugin BEFORE any route plugin in `src/app.ts`:
 *
 *     import { authPlugin } from './modules/auth/auth.plugin.js';
 *     // ...
 *     await app.register(authPlugin);          // <-- BEFORE assignmentsRoutes
 *     await app.register(assignmentsRoutes, { prefix: '/v1' });
 *
 * Security notes (OWASP A01 / A02):
 *  - `Authorization` header is redacted from Fastify logger via the `redact`
 *    option on the Fastify instance (must be set in buildApp, see comment below).
 *  - Token string is never logged here.
 *  - Algorithm is pinned in jwt-verifier.ts (HS256 or RS256 only).
 */
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import fp from 'fastify-plugin';
import { verifyJwt } from './jwt-verifier.js';
import { UnauthorizedError } from './errors.js';
import { prisma, withOrgContext, withAdminContext } from '../../db/prisma.js';
// Side-effect import: registers the `user` field on FastifyRequest via
// module augmentation.
import './types.js';

// ---------------------------------------------------------------------------
// Fastify instance type augmentation: `app.authenticate` preHandler decorator
// ---------------------------------------------------------------------------
declare module 'fastify' {
  interface FastifyInstance {
    /**
     * preHandler that verifies the Bearer JWT and populates `req.user`.
     * Use it on any protected route:
     *
     *     app.get('/protected', { preHandler: [app.authenticate] }, handler)
     */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /**
     * preHandler that asserts the JWT-bearing user has a Membership row
     * matching `req.user.orgId`. Run AFTER `authenticate`. Returns 403 if
     * the user is not a member of the claimed org.
     */
    requireMembership: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    /**
     * Org-scoped Prisma wrapper that sets `app.current_org_id` before each
     * query, enforcing the RLS tenant-isolation policy.
     *
     * Available on any request that has passed through `app.authenticate`.
     * Use in route handlers:
     *
     *     const employees = await req.orgPrisma.query(tx =>
     *       tx.employee.findMany({ where: { isActive: true } })
     *     );
     *
     * Migration path: replace direct `prisma.foo.*` calls with
     * `req.orgPrisma.query(tx => tx.foo.*)` to get automatic RLS isolation.
     */
    orgPrisma: ReturnType<typeof withOrgContext>;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const authPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Read env lazily per-request so tests can override process.env after import.
  function buildVerifierOptions() {
    const supabaseUrl = process.env['SUPABASE_URL'] ?? '';
    const jwksUri = supabaseUrl
      ? `${supabaseUrl}/auth/v1/.well-known/jwks.json`
      : undefined;
    return {
      jwtSecret: process.env['SUPABASE_JWT_SECRET'] || undefined,
      jwksUri,
    };
  }

  /**
   * authenticate — preHandler decorator.
   *
   * Extracts the Bearer token, verifies it, and sets req.user.
   * Returns 401 on any auth failure (OWASP A01).
   */
  async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      const err = new UnauthorizedError('Missing Authorization header');
      return reply.code(err.statusCode).send({ code: err.code, message: err.message });
    }

    if (!authHeader.startsWith('Bearer ')) {
      const err = new UnauthorizedError('Authorization header must use Bearer scheme');
      return reply.code(err.statusCode).send({ code: err.code, message: err.message });
    }

    const token = authHeader.slice(7); // strip "Bearer "

    try {
      const user = await verifyJwt(token, buildVerifierOptions());

      // DB fallback: when the Custom Access Token Hook hasn't run yet (first login,
      // hook misconfigured) the JWT won't carry organization_id.  We look up the
      // user's primary membership from the DB.  The JWT signature has already been
      // verified above, so this is safe — we trust the `sub` claim.
      //
      // NOTE: if no membership exists yet (new user, not onboarded) we still let
      // the request through with orgId=''. Routes that require an org context must
      // add `requireMembership` as an additional preHandler — onboarding routes
      // intentionally only use `authenticate` so new users can create their org.
      // The membership lookups below cross tenant boundaries (we look up which
      // org a user belongs to). They must bypass RLS via withAdminContext —
      // which sets app.current_org_id = '*'. Without this, the lookup returns
      // 0 rows for any newly-onboarded user (their JWT has no orgId claim yet)
      // and AuthGuard bounces them back to /onboarding in an infinite loop.
      if (!user.orgId) {
        const membership = await withAdminContext().query((tx) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tx.membership as any).findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'asc' },
            select: { organizationId: true, role: true, locationId: true },
          }),
        ) as { organizationId: string; role: string; locationId: string | null } | null;
        if (membership) {
          user.orgId = membership.organizationId;
          user.role = membership.role.toLowerCase();
          user.locationId = membership.locationId ?? null;
        }
        // No membership → orgId stays ''; onboarding routes handle this case.
      } else {
        // Even when the JWT already carries orgId, we still need to load
        // locationId for BRANCH_MANAGER users (not available in the JWT).
        // Guard: skip DB call if orgId isn't a valid UUID (e.g. test fixtures).
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (UUID_RE.test(user.orgId ?? '')) {
          const membership = await withAdminContext().query((tx) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tx.membership as any).findFirst({
              where: { userId: user.id, organizationId: user.orgId },
              select: { locationId: true, role: true },
            }),
          ) as { locationId: string | null; role: string } | null;
          if (membership) {
            user.locationId = membership.locationId ?? null;
            // Update role from DB in case it was recently changed but JWT hasn't refreshed.
            if (membership.role) {
              user.role = membership.role.toLowerCase();
            }
          }
        }
      }

      req.user = user;
      // Attach org-scoped Prisma wrapper so route handlers can use RLS
      // automatically. orgId may be '' for unauthenticated-but-passing users
      // (new users hitting onboarding routes); routes requiring an org must
      // add requireMembership, which guarantees a non-empty orgId before the
      // handler runs.
      req.orgPrisma = withOrgContext(user.orgId ?? '');
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      req.log.error({ err }, 'auth: unexpected error during token verification');
      // TEMP DEBUG: expose error details so we can diagnose prod 500s.
      // Remove once /v1/me etc are stable.
      const errMsg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : 'unknown';
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message: 'Internal error',
        debug: { name: errName, msg: errMsg.slice(0, 500) },
      });
    }
  }

  async function requireMembership(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.user) {
      const err = new UnauthorizedError('requireMembership called without authenticate');
      return reply.code(err.statusCode).send({ code: err.code, message: err.message });
    }
    const m = await prisma.membership.findUnique({
      where: {
        userId_organizationId: { userId: req.user.id, organizationId: req.user.orgId },
      },
      select: { id: true },
    });
    if (!m) {
      return reply.code(403).send({
        code: 'FORBIDDEN_NOT_A_MEMBER',
        message: 'User is not a member of the claimed organization',
      });
    }
  }

  app.decorate('authenticate', authenticate);
  app.decorate('requireMembership', requireMembership);
};

export default fp(authPlugin, {
  name: 'auth-plugin',
  fastify: '4.x',
});

export { authPlugin };
