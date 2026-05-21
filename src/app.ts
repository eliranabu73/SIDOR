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

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: ['req.headers.authorization'],
      transport:
        env.NODE_ENV === 'development'
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
  await app.register(realtimeRoutes);

  return app;
}
