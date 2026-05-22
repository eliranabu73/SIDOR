import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env';
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

export async function buildApp(): Promise<FastifyInstance> {
  // pino-pretty is a devDependency — only enable transport when explicitly
  // requested locally via PRETTY_LOGS=true (so Vercel production builds don't
  // crash on the missing module).
  const usePrettyLogs =
    env.NODE_ENV === 'development' && process.env['PRETTY_LOGS'] === 'true';

  const app = Fastify({
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
  await app.register(cors, { origin: true });

  // Auth plugin first — exposes `app.authenticate` to subsequent route plugins.
  await app.register(authPlugin);

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  await app.register(assignmentsRoutes, { prefix: '/v1' });
  await app.register(openShiftsRoutes, { prefix: '/v1' });
  await app.register(swapsRoutes, { prefix: '/v1' });
  await app.register(schedulerRoutes, { prefix: '/v1' });
  await app.register(readsRoutes, { prefix: '/v1' });
  await app.register(onboardingRoutes, { prefix: '/v1' });
  await app.register(employeesRoutes, { prefix: '/v1' });
  await app.register(shiftsCrudRoutes, { prefix: '/v1' });
  await app.register(realtimeRoutes);

  return app;
}
