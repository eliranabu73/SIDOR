import 'dotenv/config';
import { cleanEnv, str, port, url } from 'envalid';

export const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
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
});

export type Env = typeof env;
