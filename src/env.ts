import 'dotenv/config';
import { cleanEnv, str, port, url } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
  // AUTH_DISABLED is validated before other vars so the guard below can reference it.
  /** Dev/test only: bypass JWT verification. Rejected at boot when NODE_ENV=production. */
  AUTH_DISABLED: str({ default: '' }),
  PORT: port({ default: 3000 }),
  LOG_LEVEL: str({ default: 'info' }),

  DATABASE_URL: str(),
  DIRECT_URL: str({ default: '' }),
  TEST_DATABASE_URL: str({ default: '' }),

  SUPABASE_URL: url({ default: '' }),
  SUPABASE_ANON_KEY: str({ default: '' }),
  /** HS256 shared secret for Supabase JWT verification. When set, tokens are
   *  verified with HS256 using this value. When absent, RS256/JWKS is used. */
  SUPABASE_JWT_SECRET: str({ default: '' }),
  /** Supabase service-role key — required for platform-admin impersonation
   *  and for enriching the admin user list with auth.users emails. When
   *  empty, those features degrade gracefully (impersonate → 501, user list
   *  → emails are null). NEVER expose to clients. */
  SUPABASE_SERVICE_ROLE_KEY: str({ default: '' }),

  REDIS_URL: str({ default: '' }),
  JWT_SECRET: str({ default: 'dev-secret' }),

  /** Sentry DSN — when set, errors are reported. When empty, all calls no-op. */
  SENTRY_DSN: str({ default: '' }),
  /** Used to sign employee share-link tokens. Falls back to JWT_SECRET. */
  EMPLOYEE_SHARE_SECRET: str({ default: '' }),
  /** Public landing URL — used to build /e/[token] share links. */
  PUBLIC_WEB_URL: str({ default: 'https://sidor-eta.vercel.app' }),

  /** Stripe — billing. All optional; when STRIPE_SECRET_KEY is empty,
   *  billing routes return 503. */
  STRIPE_SECRET_KEY: str({ default: '' }),
  STRIPE_WEBHOOK_SECRET: str({ default: '' }),
  STRIPE_PRICE_BASIC_ILS: str({ default: '' }),
  STRIPE_PRICE_PRO_ILS: str({ default: '' }),

  /** Meta WhatsApp Cloud API — phone-number ID for the WABA sender. */
  WHATSAPP_PHONE_ID: str({ default: '' }),
  /** Meta WhatsApp Cloud API — permanent system-user / app access token. */
  WHATSAPP_TOKEN: str({ default: '' }),
  /** Token Meta sends in the GET webhook verification challenge. */
  WHATSAPP_VERIFY_TOKEN: str({ default: '' }),
  /** Meta App Secret — used to verify x-hub-signature-256 on webhooks. */
  WHATSAPP_APP_SECRET: str({ default: '' }),
  /** Approved Meta template name used for first-touch schedule publish. */
  WHATSAPP_TEMPLATE_NAME: str({ default: 'schedule_published_v1' }),
  /** BCP-47 language code for the template (matches Meta template config). */
  WHATSAPP_TEMPLATE_LANG: str({ default: 'he' }),

  /** Anthropic API key — enables Vision AI schedule import. When empty the
   *  /v1/import/parse route returns 503 (configured-but-not-ready). */
  ANTHROPIC_API_KEY: str({ default: '' }),

  /** Admin secret — used to protect /v1/admin/apply-schema-migrations and
   *  /v1/admin/db-info from unauthenticated callers. Require
   *  `Authorization: Bearer <ADMIN_SECRET>` header. When empty in production
   *  these endpoints return 503 to fail safe. */
  ADMIN_SECRET: str({ default: '' }),
});

// ---------------------------------------------------------------------------
// Security gate: AUTH_DISABLED must not be 'true' in production (WS-5d Task 4)
// ---------------------------------------------------------------------------
// envalid does not have a cross-field refine like Zod, so we validate after
// cleanEnv() returns. If the guard fires the process exits immediately with a
// clear error message — identical behaviour to envalid's own validation errors.
if (env.AUTH_DISABLED === 'true' && env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error(
    '[env] FATAL: AUTH_DISABLED=true is not allowed in production.\n' +
    '      Remove AUTH_DISABLED or set NODE_ENV != production.',
  );
  process.exit(1);
}

export type Env = typeof env;
