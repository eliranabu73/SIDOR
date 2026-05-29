import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import { env } from './env';
import { captureException, initSentry } from './shared/sentry';
import { prisma } from './db/prisma';
import { authPlugin } from './modules/auth/auth.plugin';
import { assignmentsRoutes } from './modules/assignments/assignments.routes';
import { openShiftsRoutes } from './modules/openshifts/openshifts.routes';
import { swapsRoutes } from './modules/swaps/swaps.routes';
import { realtimeRoutes } from './modules/realtime/realtime.routes';
import { schedulerRoutes } from './modules/scheduler/scheduler.routes';
import { readsRoutes } from './modules/reads/reads.routes';
import { onboardingRoutes } from './modules/onboarding/onboarding.routes';
import { employeesRoutes } from './modules/employees/employees.routes';
import { shiftsCrudRoutes } from './modules/shifts-crud/shifts-crud.routes';
import { shareRoutes } from './modules/share/share.routes';
import { posterRoutes } from './modules/share/poster.routes';
import { laborCostRoutes } from './modules/labor-cost/labor-cost.routes';
import { swapsMarketplaceRoutes } from './modules/swaps/swaps-marketplace.routes';
import { fairnessRoutes } from './modules/fairness/fairness.routes';
import { billingRoutes } from './modules/billing/billing.routes';
import { importRoutes } from './modules/import/import.routes';
import { settingsRoutes } from './modules/settings/settings.routes';
import { templatesRoutes } from './modules/templates/templates.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { payrollRoutes } from './modules/payroll/payroll.routes';
import { timeoffRoutes } from './modules/timeoff/timeoff.routes';
import { tipsRoutes } from './modules/tips/tips.routes';
import { timetrackingRoutes } from './modules/timetracking/timetracking.routes';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes';

export async function buildApp(): Promise<FastifyInstance> {
  // Initialise Sentry first so errors during boot get captured.
  await initSentry();

  // pino-pretty is a devDependency — only enable transport when explicitly
  // requested locally via PRETTY_LOGS=true (so Vercel production builds don't
  // crash on the missing module).
  const usePrettyLogs =
    env.NODE_ENV === 'development' && process.env['PRETTY_LOGS'] === 'true';

  const app = Fastify({
    // Generate a correlation id per request — propagated to logs + Sentry.
    genReqId: (req) =>
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    // HMAC-signed share tokens (employee portal) are ~188 chars and embed
    // into /v1/share/:token/* routes. Fastify's default 100-char cap on
    // route params makes find-my-way return 404 before any handler runs.
    maxParamLength: 500,
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization'],
      transport: usePrettyLogs
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
        : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(sensible);
  // In development/test allow all origins; in production restrict to the
  // canonical web origin to prevent cross-site request abuse.
  const allowedOrigin =
    env.NODE_ENV === 'production'
      ? [env.PUBLIC_WEB_URL, 'https://sidor-eta.vercel.app']
      : true;
  await app.register(cors, { origin: allowedOrigin, credentials: true });

  // Auth plugin first — exposes `app.authenticate` to subsequent route plugins.
  await app.register(authPlugin);

  // Centralised error hook — pushes to Sentry + structured log with reqId.
  app.setErrorHandler((err, req, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    req.log.error(
      { err, reqId: req.id, route: req.routerPath, statusCode },
      'request failed',
    );
    if (statusCode >= 500) {
      captureException(err, { reqId: req.id, route: req.routerPath });
    }
    if (!reply.sent) {
      reply
        .code(statusCode)
        .header('x-request-id', req.id)
        .send({
          code: (err as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: err.message ?? 'Unexpected error',
          reqId: req.id,
        });
    }
  });

  // Liveness — cheap, no IO.
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // Readiness — verifies DB. Returns 503 on any failure so Vercel/uptime
  // Temporary debug: show which columns exist in employees/schedules tables
  app.get('/debug/columns', async (_req, reply) => {
    try {
      const [cols, meta] = await Promise.all([
        prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
          `SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('employees','schedules','organizations') AND column_name IN ('hireDate','submittedAt','logoUrl','userId') ORDER BY table_name, column_name`
        ),
        prisma.$queryRawUnsafe<{ current_user: string; current_schema: string; db_url_host: string }[]>(
          `SELECT current_user, current_schema(), inet_server_addr()::text AS db_url_host`
        ),
      ]);
      return reply.send({ columns: cols, meta, databaseUrl: (process.env['DATABASE_URL'] ?? '').replace(/:\/\/[^@]+@/, '://***@') });
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Temporary debug: probe whether interactive transactions work via txPrisma.
  // Hits the exact same code path as withOrgContext / withAdminContext.
  app.get('/debug/tx', async (_req, reply) => {
    const { withAdminContext } = await import('./db/prisma.js') as typeof import('./db/prisma');
    const out: Record<string, unknown> = {
      hasDirectUrl: Boolean(process.env['DIRECT_URL']),
      directUrlHost: process.env['DIRECT_URL']
        ? (process.env['DIRECT_URL'].match(/@([^:/?]+)/) || [])[1]
        : null,
      databaseUrlPrefix: (process.env['DATABASE_URL'] ?? '').slice(0, 20),
    };
    try {
      const t0 = Date.now();
      const rows = await withAdminContext().query(async (tx) => {
        const r = await tx.$queryRawUnsafe(`SELECT 1 AS ok`);
        return r;
      });
      out['txOk'] = true;
      out['txMs'] = Date.now() - t0;
      out['txRows'] = rows;
    } catch (err) {
      out['txOk'] = false;
      out['txError'] = err instanceof Error ? err.message : String(err);
      out['txErrorName'] = err instanceof Error ? err.name : null;
    }
    return reply.send(out);
  });

  // monitors can tell a stale deploy from a live one.
  app.get('/ready', async (_req, reply) => {
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};
    const t0 = Date.now();
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      checks['db'] = { ok: true, ms: Date.now() - t0 };
    } catch (err) {
      checks['db'] = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    const ok = Object.values(checks).every((c) => c.ok);
    return reply.code(ok ? 200 : 503).send({
      status: ok ? 'ready' : 'degraded',
      ts: new Date().toISOString(),
      checks,
    });
  });

  await app.register(assignmentsRoutes, { prefix: '/v1' });
  await app.register(openShiftsRoutes, { prefix: '/v1' });
  await app.register(swapsRoutes, { prefix: '/v1' });
  await app.register(schedulerRoutes, { prefix: '/v1' });
  await app.register(readsRoutes, { prefix: '/v1' });
  await app.register(onboardingRoutes, { prefix: '/v1' });
  await app.register(employeesRoutes, { prefix: '/v1' });
  await app.register(shiftsCrudRoutes, { prefix: '/v1' });
  await app.register(shareRoutes);
  await app.register(posterRoutes);
  await app.register(laborCostRoutes, { prefix: '/v1' });
  await app.register(swapsMarketplaceRoutes);
  await app.register(fairnessRoutes, { prefix: '/v1' });
  await app.register(importRoutes, { prefix: '/v1' });
  await app.register(settingsRoutes, { prefix: '/v1' });
  await app.register(templatesRoutes, { prefix: '/v1' });
  await app.register(billingRoutes, { prefix: '/v1' });
  await app.register(adminRoutes, { prefix: '/v1/admin' });
  await app.register(payrollRoutes, { prefix: '/v1' });
  await app.register(timeoffRoutes, { prefix: '/v1' });
  await app.register(tipsRoutes, { prefix: '/v1' });
  await app.register(timetrackingRoutes, { prefix: '/v1' });
  await app.register(whatsappRoutes, { prefix: '/v1' });
  await app.register(realtimeRoutes);

  return app;
}
