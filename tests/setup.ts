// Jest setup: silence Fastify logs, etc.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Per-suite Prisma test schema bootstrapping is added in Phase C
// (uses TEST_DATABASE_URL + prisma migrate deploy in globalSetup).

jest.setTimeout(15000);
