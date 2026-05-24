/**
 * Module augmentation: add `user` to FastifyRequest.
 *
 * Import this file anywhere you need `req.user` — or import it once in
 * `src/modules/auth/auth.plugin.ts` so it's pulled in transitively.
 */
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Populated by `authPlugin` after a successful token verification.
     * Absent on unauthenticated routes.
     */
    user?: {
      /** Supabase user UUID (JWT `sub` claim) */
      id: string;
      /** Organisation UUID from user_metadata or app_metadata */
      orgId: string;
      /** Role from app_metadata.role — defaults to 'employee' */
      role: string;
      /** Email from JWT `email` claim — used for platform-admin allowlist. */
      email?: string;
      /**
       * Location UUID — only set when role === 'branch_manager'.
       * Populated from the Membership record in the DB fallback path.
       */
      locationId?: string | null;
    };
  }
}
