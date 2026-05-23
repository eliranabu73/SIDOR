/**
 * Platform-admin gate.
 *
 * A "platform admin" is the SaaS owner — distinct from an org-level OWNER.
 * Platform admins can view/manage data across ALL tenants (RLS bypassed via
 * `withAdminContext()`). Membership is determined by email allowlist set in
 * the `PLATFORM_ADMIN_EMAILS` env var (comma-separated). If the env var is
 * unset, defaults to `eliranabu320@gmail.com` (the founding SaaS owner).
 *
 * Security notes:
 *  - Email comes from the JWT `email` claim, verified by `verifyJwt()`.
 *  - Comparison is case-insensitive (emails are case-insensitive per RFC 5321).
 *  - This is a server-side check — the frontend "isAdmin" flag is for UX
 *    only; every admin route MUST re-verify via this helper.
 */
import type { FastifyRequest } from 'fastify';

const DEFAULT_ADMIN_EMAILS = 'eliranabu320@gmail.com';

export function getAdminEmails(): string[] {
  const raw = process.env['PLATFORM_ADMIN_EMAILS'] ?? DEFAULT_ADMIN_EMAILS;
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function isPlatformAdmin(req: FastifyRequest): boolean {
  const email = req.user?.email?.toLowerCase();
  if (!email) return false;
  return getAdminEmails().includes(email);
}
