/**
 * Jest globalSetup for integration tests.
 *
 * Runs ONCE before any test worker starts. Deploys the Prisma migration
 * against the test Postgres schema (TEST_DATABASE_URL) and sets DATABASE_URL
 * so the default Prisma singleton will connect to the same schema when any
 * module is loaded inside the workers.
 */
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
import * as path from 'path';

export default async function globalSetup(): Promise<void> {
  // Load .env so TEST_DATABASE_URL is available in this process.
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });

  const testUrl = process.env['TEST_DATABASE_URL'];
  if (!testUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Add it to your .env file.\n' +
        'Example: TEST_DATABASE_URL="postgresql://...?schema=test"',
    );
  }

  console.log('[integration/setup] Running prisma migrate deploy against test schema…');

  execSync('npx prisma migrate deploy', {
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
      DIRECT_URL: testUrl,
    },
    stdio: 'inherit',
  });

  console.log('[integration/setup] Migrations applied. Test DB is ready.');
}
