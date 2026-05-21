/**
 * Jest globalTeardown for integration tests.
 *
 * Disconnects the Prisma client after all workers have finished so Node.js
 * can exit cleanly without a hanging connection pool.
 */
import { PrismaClient } from '@prisma/client';

export default async function globalTeardown(): Promise<void> {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) return;

  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: [],
  });

  try {
    await prisma.$disconnect();
  } catch {
    // best-effort
  }

  console.log('[integration/teardown] Prisma disconnected.');
}
