/**
 * Jest configuration for real-DB integration tests.
 *
 * Runs tests serially (maxWorkers:1) to prevent concurrent Prisma transactions
 * from fighting over row-level locks across test cases.
 *
 * Usage:
 *   npx jest --config jest.integration.config.ts
 *
 * Environment requirements:
 *   TEST_DATABASE_URL — must point to a Postgres schema separate from the
 *   development DB (e.g. "postgresql://…?schema=test").
 *   REDIS_URL         — leave unset; LocksService falls back to the in-memory shim.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import type { Config } from 'jest';

// Point the Prisma default singleton at the test schema for every worker process.
if (!process.env['TEST_DATABASE_URL']) {
  console.warn('[jest.integration.config] TEST_DATABASE_URL is not set — tests will fail.');
}
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
// Ensure DIRECT_URL is also set (Prisma prisma migrate deploy needs it).
process.env['DIRECT_URL'] = process.env['TEST_DATABASE_URL'] ?? '';
// Force in-memory Redis shim (no TTL expiry surprises in tests).
delete process.env['REDIS_URL'];

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/integration/**/*.test.ts'],
  globalSetup: '<rootDir>/tests/integration/setup.ts',
  globalTeardown: '<rootDir>/tests/integration/teardown.ts',
  // Serial execution — prevents optimistic-lock races between test suites.
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        // isolatedModules speeds compilation; integration tests rarely need
        // full type-check during run.
        isolatedModules: true,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Give each test up to 30 s — remote Supabase round-trips can be slow.
  testTimeout: 30_000,
  clearMocks: true,
  verbose: true,
};

export default config;
