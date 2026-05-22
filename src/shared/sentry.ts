/**
 * Sentry wrapper — initializes only when SENTRY_DSN is set.
 * Without DSN every function is a cheap no-op so prod runs without Sentry
 * (e.g. local/dev or before secret is provisioned).
 */
import { env } from '../env';

type Stub = {
  init: (opts: unknown) => void;
  captureException: (err: unknown, context?: unknown) => void;
  setUser: (u: unknown) => void;
  setContext: (k: string, v: unknown) => void;
  flush: (ms?: number) => Promise<boolean>;
};

let sentry: Stub = {
  init: () => undefined,
  captureException: () => undefined,
  setUser: () => undefined,
  setContext: () => undefined,
  flush: async () => true,
};

let initialised = false;

export async function initSentry(): Promise<void> {
  if (initialised) return;
  initialised = true;
  if (!env.SENTRY_DSN) return;
  try {
    // Dynamic import via runtime-resolved name so TS skips the missing-module
    // type check; the dep is optional.
    const modName = '@sentry/node';
    const mod = (await import(/* @vite-ignore */ modName)) as unknown as Stub;
    mod.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: 0,
    });
    sentry = mod;
  } catch (err) {
    // Module not installed yet — degrade silently
    // eslint-disable-next-line no-console
    console.warn('[sentry] @sentry/node not installed; skipping init');
  }
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  sentry.captureException(err, context);
}

export function flushSentry(ms = 2000): Promise<boolean> {
  return sentry.flush(ms);
}
