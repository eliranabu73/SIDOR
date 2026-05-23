/**
 * Unit test for `withAdminContext()` — verifies the wrapper issues
 * `SET LOCAL row_security = off` BEFORE running the caller's query, so that
 * RLS policies are skipped inside the transaction.
 *
 * Mocks @prisma/client at the top of the file (Jest hoists `jest.mock`),
 * exposing the captured executeRawUnsafe call list to the assertion.
 */
const sqlCalls: string[] = [];
const fakeTx = {
  $executeRawUnsafe: jest.fn(async (sql: string) => {
    sqlCalls.push(sql);
  }),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: class {
    async $transaction<T>(fn: (tx: typeof fakeTx) => Promise<T>): Promise<T> {
      return fn(fakeTx);
    }
    $extends() { return this; }
  },
  Prisma: {},
}));

import { withAdminContext } from '../../src/db/prisma';

beforeEach(() => {
  sqlCalls.length = 0;
  fakeTx.$executeRawUnsafe.mockClear();
});

describe('withAdminContext()', () => {
  it('issues SET LOCAL row_security = off before invoking the query fn', async () => {
    const db = withAdminContext();
    let queryRan = false;
    const result = await db.query(async () => {
      queryRan = true;
      // The SET LOCAL must have run by now.
      expect(sqlCalls[0]).toMatch(/SET LOCAL row_security = off/);
      return 42;
    });
    expect(queryRan).toBe(true);
    expect(result).toBe(42);
    expect(fakeTx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
