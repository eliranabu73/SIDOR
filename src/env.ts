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

  REDIS_URL: str({ default: '' }),
  JWT_SECRET: str({ default: 'dev-secret' }),
});

export type Env = typeof env;
