import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Builds a Prisma client — standard in dev/local, with Accelerate extension
 * in production when DATABASE_URL is a `prisma://` URL (avoids IPv6 issues
 * with Vercel Lambda which has no IPv6 egress to Supabase).
 */
function makePrisma(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  if (process.env.DATABASE_URL?.startsWith('prisma://')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { withAccelerate } = require('@prisma/extension-accelerate') as typeof import('@prisma/extension-accelerate');
    return base.$extends(withAccelerate()) as unknown as PrismaClient;
  }
  return base;
}

export const prisma: PrismaClient = globalThis.__prisma ?? makePrisma();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
