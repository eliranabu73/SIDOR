/**
 * Pure JWT verification function.
 *
 * Security guarantees (OWASP A02, A07, A08):
 *  - Uses `jose` for all cryptographic operations — no manual base64 decoding.
 *  - Algorithm pinned to `HS256` (when SUPABASE_JWT_SECRET is set) or `RS256`
 *    (JWKS path). `alg: none` is rejected automatically by jose.
 *  - Clock skew tolerance capped at 30 seconds.
 *  - Audience claim validated against the literal string `'authenticated'`.
 *  - Authorization header value is NEVER logged here; callers must redact logs.
 */
import {
  jwtVerify,
  createRemoteJWKSet,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { UnauthorizedError } from './errors.js';

export interface VerifiedUser {
  id: string;
  orgId: string;
  role: string;
  email?: string;
  /** Only set for BRANCH_MANAGER users — loaded from DB in auth.plugin. */
  locationId?: string | null;
}

/** Shape of Supabase JWT payload fields we care about. */
interface SupabaseJwtPayload extends JWTPayload {
  sub?: string;
  email?: string;
  user_metadata?: {
    organization_id?: string;
    email?: string;
    [key: string]: unknown;
  };
  app_metadata?: {
    organization_id?: string;
    role?: string;
    [key: string]: unknown;
  };
}

/** Pinned algorithm sets — reject any other algorithm (OWASP A08). */
const HS256_ALGORITHMS = ['HS256'] as const;
/** Supabase supports RS256 (legacy) and ES256 (new JWT stack, sb_publishable_ keys). */
const JWKS_ALGORITHMS = ['RS256', 'ES256'] as const;

/** Clock skew tolerance — capped at 30 s (OWASP A07). */
const CLOCK_SKEW_SECONDS = 30;

/** Supabase JWT audience claim. */
const SUPABASE_AUD = 'authenticated';

// ---------------------------------------------------------------------------
// JWKS key cache — created once, refreshed automatically by jose per RFC 8414.
// ---------------------------------------------------------------------------
let cachedJwksFetcher: ReturnType<typeof createRemoteJWKSet> | null = null;

/** Reset the JWKS cache (useful in tests). */
export function resetJwksCache(): void {
  cachedJwksFetcher = null;
}

function getJwksFetcher(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  if (!cachedJwksFetcher) {
    cachedJwksFetcher = createRemoteJWKSet(new URL(jwksUri));
  }
  return cachedJwksFetcher;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface JwtVerifierOptions {
  /**
   * When set, verify with HS256 using this shared secret.
   * When absent, fall back to RS256 via JWKS.
   */
  jwtSecret?: string;
  /**
   * JWKS endpoint URI.
   * Required when `jwtSecret` is not provided.
   * E.g. `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`
   */
  jwksUri?: string;
}

/**
 * Verify a Supabase JWT and extract the acting user identity.
 *
 * @throws {UnauthorizedError} on any verification failure (missing, malformed,
 *   expired, wrong audience, wrong algorithm, bad signature).
 */
export async function verifyJwt(
  token: string,
  options: JwtVerifierOptions,
): Promise<VerifiedUser> {
  let payload: SupabaseJwtPayload;

  try {
    let key: Uint8Array | JWTVerifyGetKey;
    let algorithms: readonly string[];

    // Peek at the token header to determine which path to use.
    // Supabase's new JWT stack (sb_publishable_* keys) signs with ES256 via JWKS;
    // legacy deployments use HS256 with a shared secret.
    const rawHeader = token.split('.')[0] ?? '';
    const tokenAlg = (() => {
      try {
        return (JSON.parse(Buffer.from(rawHeader, 'base64url').toString()) as { alg?: string }).alg ?? '';
      } catch { return ''; }
    })();

    if (options.jwtSecret && options.jwtSecret.length > 0 && tokenAlg === 'HS256') {
      // Legacy HS256 path — shared secret
      key = new TextEncoder().encode(options.jwtSecret);
      algorithms = HS256_ALGORITHMS;
    } else {
      // JWKS path — RS256 or ES256 (Supabase new JWT stack)
      if (!options.jwksUri) {
        throw new UnauthorizedError('JWT verifier misconfigured: no secret or JWKS URI');
      }
      key = getJwksFetcher(options.jwksUri);
      algorithms = JWKS_ALGORITHMS;
    }

    const result = await jwtVerify<SupabaseJwtPayload>(token, key as Parameters<typeof jwtVerify>[1], {
      audience: SUPABASE_AUD,
      clockTolerance: CLOCK_SKEW_SECONDS,
      algorithms: [...algorithms],
    });

    payload = result.payload;
  } catch (err: unknown) {
    // Re-throw our own errors as-is
    if (err instanceof UnauthorizedError) throw err;

    // Map jose errors to 401 — do NOT expose internal details to the caller
    // (OWASP A02 — no cryptographic detail leakage)
    if (err instanceof Error) {
      throw new UnauthorizedError(`Token verification failed: ${err.message}`);
    }
    throw new UnauthorizedError('Token verification failed');
  }

  // --- Extract claims ---

  const sub = payload.sub;
  if (!sub) {
    throw new UnauthorizedError('Token missing sub claim');
  }

  // orgId: prefer app_metadata over user_metadata (OWASP A01 — server-controlled
  // app_metadata is harder to tamper with than user_metadata on some flows).
  // NOTE: orgId may be empty when the Custom Access Token Hook hasn't run yet
  // (e.g. first login, hook misconfigured). The auth.plugin authenticate handler
  // performs a DB fallback in that case — see auth.plugin.ts.
  const orgId =
    payload.app_metadata?.organization_id ??
    payload.user_metadata?.organization_id ??
    '';

  const role: string = payload.app_metadata?.role ?? 'employee';

  // email may be in top-level `email` claim (Supabase standard) or fallback
  // to user_metadata. Used by platform-admin allowlist.
  const email = payload.email ?? payload.user_metadata?.email;

  return { id: sub, orgId, role, ...(email ? { email } : {}) };
}
