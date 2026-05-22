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
});

export type Env = typeof env;
