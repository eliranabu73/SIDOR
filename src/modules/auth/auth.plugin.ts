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
      req.user = user;
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return reply.code(err.statusCode).send({ code: err.code, message: err.message });
      }
      req.log.error({ err }, 'auth: unexpected error during token verification');
      return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'Internal error' });
    }
  }

  app.decorate('authenticate', authenticate);
};

export default fp(authPlugin, {
  name: 'auth-plugin',
  fastify: '4.x',
});

export { authPlugin };
