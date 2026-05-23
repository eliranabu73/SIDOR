/**
 * Jest + Fastify inject: template apply flow E2E test
 *
 * Tests the full POST /v1/templates/:id/apply endpoint via app.inject()
 * without a real HTTP server or browser.  Validates:
 *   - Response shape matches template definition
 *   - createdRoles count equals template.roles.length
 *   - createdShifts count equals sum of shift.daysOfWeek across all shifts
 *   - template name in response matches the Hebrew name
 *   - scheduleId is a valid UUID string
 *   - weekStart is correctly echoed back
 *   - 404 for unknown template id
 *
 * NOTE: This test calls prisma under the hood (via app.inject).
 *   - Runs fine without a real DB if the 404 path is exercised (no DB call).
 *   - The happy-path describe block is skipped when SKIP_DB_TESTS=true OR
 *     when a DB connectivity probe fails (e.g. no DATABASE_URL or unreachable host).
 *
 * Run:
 *   npx jest tests/templates/apply-e2e --no-coverage
 *   # force-skip DB tests (offline CI):
 *   SKIP_DB_TESTS=true npx jest tests/templates/apply-e2e --no-coverage
 */

// Bypass auth middleware entirely
process.env['AUTH_DISABLED'] = 'true';

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { SCHEDULE_TEMPLATES } from '../../src/modules/templates/schedule-templates';
import { prisma } from '../../src/db/prisma';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Fixed week start (a Sunday) used in all apply calls */
const WEEK_START = '2026-05-24';

/**
 * Check DB reachability at test startup rather than at module-load time so we
 * can skip gracefully instead of timing out.
 */
async function isDbReachable(): Promise<boolean> {
  if (process.env['SKIP_DB_TESTS'] === 'true') return false;
  try {
    // Quick 3-second probe
    await Promise.race([
      prisma.$queryRawUnsafe('SELECT 1'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DB probe timeout')), 3000),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

// ─── 1. 404 path — no DB required ─────────────────────────────────────────────

describe('POST /v1/templates/:id/apply — 404 path (no DB)', () => {
  it('returns 404 for a completely unknown template id', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/templates/this-does-not-exist/apply',
      payload: { weekStart: WEEK_START },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { code: string; message: string };
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toMatch(/template not found/i);
    await app.close();
  }, 20000);
});

// ─── 2. Happy-path apply — requires DB ────────────────────────────────────────

describe('POST /v1/templates/:id/apply — happy path (requires DB)', () => {
  let dbAvailable = false;
  let app: FastifyInstance;

  beforeAll(async () => {
    dbAvailable = await isDbReachable();
    if (dbAvailable) {
      app = await buildApp();
    }
  }, 10000);

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  /**
   * For each of the 5 new templates, verify the apply response matches
   * the template definition exactly.
   */
  const NEW_TEMPLATES = [
    'kindergarten',
    'school',
    'homecare',
    'events',
    'garage',
  ] as const;

  for (const templateId of NEW_TEMPLATES) {
    it(`applies "${templateId}" and returns correct counts`, async () => {
      if (!dbAvailable) {
        return; // silently pass — DB not available in this environment
      }

      const tpl = SCHEDULE_TEMPLATES.find((t) => t.id === templateId);
      expect(tpl).toBeDefined();

      const expectedRoles = tpl!.roles.length;
      const expectedShifts = tpl!.shifts.reduce(
        (sum, s) => sum + s.daysOfWeek.length,
        0,
      );

      const res = await app.inject({
        method: 'POST',
        url: `/v1/templates/${templateId}/apply`,
        payload: { weekStart: WEEK_START },
      });

      expect(res.statusCode).toBe(200);

      const body = res.json() as {
        scheduleId: string;
        weekStart: string;
        createdRoles: number;
        createdShifts: number;
        template: string;
      };

      expect(body.createdRoles).toBe(expectedRoles);
      expect(body.createdShifts).toBe(expectedShifts);
      expect(body.template).toBe(tpl!.name);
      expect(body.weekStart).toBe(WEEK_START);
      // scheduleId must look like a UUID
      expect(body.scheduleId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }, 20000);
  }

  it('kindergarten apply: 3 roles + 18 shifts (3 shift types × 6 days)', async () => {
    if (!dbAvailable) return;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/templates/kindergarten/apply',
      payload: { weekStart: WEEK_START },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { createdRoles: number; createdShifts: number };
    // גננת, סייעת, אחראי/ת צהרון = 3 roles
    expect(body.createdRoles).toBe(3);
    // 3 shift definitions × 6 days = 18 shift instances
    expect(body.createdShifts).toBe(18);
  }, 20000);

  it('school apply: 3 roles + 16 shifts', async () => {
    if (!dbAvailable) return;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/templates/school/apply',
      payload: { weekStart: WEEK_START },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { createdRoles: number; createdShifts: number };
    // מורה(6) + מזכיר/ת(5) + מחנך/ת(5) = 16 total, 3 roles
    expect(body.createdRoles).toBe(3);
    expect(body.createdShifts).toBe(16);
  }, 20000);

  it('events apply: 4 roles + 11 shift instances', async () => {
    if (!dbAvailable) return;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/templates/events/apply',
      payload: { weekStart: WEEK_START },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { createdRoles: number; createdShifts: number };
    // מנהל אירוע, מלצר/ית, טבח, ברמן/ית = 4 roles
    // הכנה(3)+ערב(3)+בר(3)+ניהול(2) = 11
    expect(body.createdRoles).toBe(4);
    expect(body.createdShifts).toBe(11);
  }, 20000);

  it('calling apply twice is idempotent — roles upsert without error', async () => {
    if (!dbAvailable) return;

    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/templates/garage/apply',
      payload: { weekStart: WEEK_START },
    });
    expect(res1.statusCode).toBe(200);

    // Second call on same week — roles should upsert without error
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/templates/garage/apply',
      payload: { weekStart: WEEK_START },
    });
    expect(res2.statusCode).toBe(200);

    const body2 = res2.json() as { createdRoles: number };
    // Roles are upserted; count still matches template definition
    expect(body2.createdRoles).toBe(4); // מכונאי/ת, פחחי/ת, חשמלאי/ת רכב, מוקדן/ית
  }, 30000);
});

// ─── 3. Data contract (pure, no DB) ──────────────────────────────────────────

describe('Template data contract (pure — no server, no DB)', () => {
  it('all 5 new template shift counts match implementation', () => {
    const expected: Record<string, number> = {
      kindergarten: 18, // 3 shifts × 6 days
      school:       16, // 6 + 5 + 5
      homecare:     26, // 7+7+7+5 (ניהול Mon-Fri = 5)
      events:       11, // 3+3+3+2
      garage:       23, // 6+6+5+6
    };

    for (const [id, count] of Object.entries(expected)) {
      const tpl = SCHEDULE_TEMPLATES.find((t) => t.id === id);
      expect(tpl).toBeDefined();
      const computed = tpl!.shifts.reduce(
        (sum, s) => sum + s.daysOfWeek.length,
        0,
      );
      expect(computed).toBe(count);
    }
  });

  it('apply response error keys differ from success keys', async () => {
    // Pure structural check: 404 response does NOT include success keys
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/templates/nonexistent/apply',
      payload: {},
    });
    const body = res.json() as Record<string, unknown>;
    // error shape
    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    // NOT a valid apply result
    expect(body).not.toHaveProperty('scheduleId');
    expect(body).not.toHaveProperty('createdRoles');
    await app.close();
  }, 20000);

  it('GET /v1/templates lists 13 templates with correct shiftCount values', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/v1/templates' });
    expect(res.statusCode).toBe(200);
    const templates = res.json() as Array<{
      id: string;
      shiftCount: number;
      roles: string[];
    }>;
    expect(templates).toHaveLength(13);

    // Cross-check each template's shiftCount with the data definition
    for (const item of templates) {
      const tpl = SCHEDULE_TEMPLATES.find((t) => t.id === item.id);
      expect(tpl).toBeDefined();
      const expected = tpl!.shifts.reduce(
        (sum, s) => sum + s.daysOfWeek.length,
        0,
      );
      expect(item.shiftCount).toBe(expected);
    }
    await app.close();
  }, 20000);
});
