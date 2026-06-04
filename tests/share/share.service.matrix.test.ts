/**
 * Matrix unit tests for share.service — exhaustive, deterministic, table-driven.
 *
 * Covers: employee + poster token signing/verification, expiry boundaries,
 * intent/scope handling, signature tampering, malformed-token handling,
 * cross-secret rejection, idempotency, URL building, Israeli phone normalisation,
 * and the DB-backed bundle/view builders (with an injected fake db).
 *
 * All token functions are pure (HMAC + base64url + JSON). The few clock-dependent
 * paths (exp default) are exercised only via FIXED ttlSeconds offsets and a
 * pinned `jest.useFakeTimers` clock so every expectation is deterministic.
 */

import { createHmac } from 'node:crypto';

// Mock env + prisma so module init has no side-effects and the secret is known.
jest.mock('../../src/db/prisma', () => ({ prisma: {} }));
jest.mock('../../src/env', () => ({
  env: {
    EMPLOYEE_SHARE_SECRET: 'test-share-secret-32-bytes-ok!!!',
    JWT_SECRET: 'test-jwt-secret',
    PUBLIC_WEB_URL: 'https://sidor-test.vercel.app',
  },
}));

import {
  signEmployeeToken,
  verifyEmployeeToken,
  signPosterToken,
  verifyPosterToken,
  issueEmployeePortalToken,
  shareUrlForEmployee,
  whatsappLinkForPhone,
  buildPublishBundle,
  buildRequestLinksBundle,
  fetchEmployeeView,
} from '../../src/modules/share/share.service';
import type { Db } from '../../src/db/prisma';

const SECRET = 'test-share-secret-32-bytes-ok!!!';
const ORG_ID = '10000000-0000-0000-0000-000000000001';
const ORG_ID_2 = '10000000-0000-0000-0000-0000000000ff';
const EMP_ID = '20000000-0000-0000-0000-000000000002';
const SCHED_ID = '30000000-0000-0000-0000-000000000003';

// A fixed wall-clock instant used by every clock-dependent test.
// 2026-06-04T12:00:00Z → unix seconds 1780920000.
const FIXED_NOW_MS = Date.UTC(2026, 5, 4, 12, 0, 0); // month is 0-based → June
const FIXED_NOW_SEC = Math.floor(FIXED_NOW_MS / 1000);

// ---------------------------------------------------------------------------
// Local re-implementations of the wire codec, used ONLY to hand-build tokens /
// inspect payloads. These deliberately mirror the format but are independent of
// the source's verify path, so expectations are not "recomputed by the SUT".
// ---------------------------------------------------------------------------
function b64u(input: Buffer | string): string {
  const b = typeof input === 'string' ? Buffer.from(input) : input;
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
function b64uDecodeToString(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8',
  );
}
function decodePayload(token: string): Record<string, unknown> {
  const head = token.split('.')[0]!;
  return JSON.parse(b64uDecodeToString(head)) as Record<string, unknown>;
}
/** Build a token with an arbitrary payload signed with `secret`. */
function forge(payload: Record<string, unknown>, secret = SECRET): string {
  const head = b64u(JSON.stringify(payload));
  const sig = b64u(createHmac('sha256', secret).update(head).digest());
  return `${head}.${sig}`;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(FIXED_NOW_MS));
});
afterEach(() => {
  jest.useRealTimers();
});

// ===========================================================================
// signEmployeeToken — structure & deterministic payload
// ===========================================================================
describe('signEmployeeToken — structure', () => {
  it('produces exactly two non-empty dot-separated parts', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID });
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
  });

  it('head contains no base64 padding "=" characters', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID });
    expect(token).not.toContain('=');
  });

  it('payload encodes eid/oid and exp = now + 90 days by default', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID });
    const p = decodePayload(token);
    expect(p.eid).toBe(EMP_ID);
    expect(p.oid).toBe(ORG_ID);
    // 90 days = 7776000 s; pinned clock → exact value.
    expect(p.exp).toBe(FIXED_NOW_SEC + 7776000);
  });

  it('omits int field for default (share) intent', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID });
    const p = decodePayload(token);
    expect('int' in p).toBe(false);
  });

  it('omits int field when intent explicitly "share"', () => {
    const token = signEmployeeToken({
      employeeId: EMP_ID,
      organizationId: ORG_ID,
      intent: 'share',
    });
    expect('int' in decodePayload(token)).toBe(false);
  });

  it('includes int="employee_portal" when intent is employee_portal', () => {
    const token = signEmployeeToken({
      employeeId: EMP_ID,
      organizationId: ORG_ID,
      intent: 'employee_portal',
    });
    expect(decodePayload(token).int).toBe('employee_portal');
  });

  it.each([
    [1, FIXED_NOW_SEC + 1],
    [60, FIXED_NOW_SEC + 60],
    [3600, FIXED_NOW_SEC + 3600],
    [86400, FIXED_NOW_SEC + 86400],
    [7776000, FIXED_NOW_SEC + 7776000],
  ])('ttlSeconds=%d → exp=%d (pinned clock)', (ttl, expectedExp) => {
    const token = signEmployeeToken({
      employeeId: EMP_ID,
      organizationId: ORG_ID,
      ttlSeconds: ttl,
    });
    expect(decodePayload(token).exp).toBe(expectedExp);
  });

  it('is idempotent under a fixed clock (same inputs → identical token)', () => {
    const a = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 100 });
    const b = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 100 });
    expect(a).toBe(b);
  });

  it('different employeeId → different token', () => {
    const a = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 100 });
    const b = signEmployeeToken({ employeeId: 'other-emp', organizationId: ORG_ID, ttlSeconds: 100 });
    expect(a).not.toBe(b);
  });

  it('different organizationId → different token (org binding)', () => {
    const a = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 100 });
    const b = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID_2, ttlSeconds: 100 });
    expect(a).not.toBe(b);
  });
});

// ===========================================================================
// verifyEmployeeToken — round-trip matrix
// ===========================================================================
describe('verifyEmployeeToken — valid round-trips', () => {
  it.each([
    ['default share', undefined, 'share'],
    ['explicit share', 'share', 'share'],
    ['employee_portal', 'employee_portal', 'employee_portal'],
  ])('%s → decodes ids and intent=%s', (_label, intent, expectedIntent) => {
    const token = signEmployeeToken({
      employeeId: EMP_ID,
      organizationId: ORG_ID,
      ttlSeconds: 1000,
      intent: intent as 'share' | 'employee_portal' | undefined,
    });
    const decoded = verifyEmployeeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.employeeId).toBe(EMP_ID);
    expect(decoded!.organizationId).toBe(ORG_ID);
    expect(decoded!.intent).toBe(expectedIntent);
    expect(decoded!.exp).toBe(FIXED_NOW_SEC + 1000);
  });

  it('unknown int value falls back to "share"', () => {
    const token = forge({ eid: EMP_ID, oid: ORG_ID, exp: FIXED_NOW_SEC + 100, int: 'weird' });
    const decoded = verifyEmployeeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.intent).toBe('share');
  });
});

// ===========================================================================
// verifyEmployeeToken — expiry boundary matrix
// ===========================================================================
describe('verifyEmployeeToken — expiry boundaries', () => {
  it.each([
    ['expired 1h ago', FIXED_NOW_SEC - 3600, true],
    ['expired 1s ago', FIXED_NOW_SEC - 1, true],
    ['exp == now (not strictly less) → valid', FIXED_NOW_SEC, false],
    ['exp 1s in future → valid', FIXED_NOW_SEC + 1, false],
    ['exp far future → valid', FIXED_NOW_SEC + 999999, false],
  ])('%s', (_label, exp, shouldBeNull) => {
    const token = forge({ eid: EMP_ID, oid: ORG_ID, exp });
    const decoded = verifyEmployeeToken(token);
    if (shouldBeNull) {
      expect(decoded).toBeNull();
    } else {
      expect(decoded).not.toBeNull();
      expect(decoded!.exp).toBe(exp);
    }
  });

  it('non-numeric exp → null', () => {
    const token = forge({ eid: EMP_ID, oid: ORG_ID, exp: 'soon' });
    expect(verifyEmployeeToken(token)).toBeNull();
  });

  it('missing exp → null', () => {
    const token = forge({ eid: EMP_ID, oid: ORG_ID });
    expect(verifyEmployeeToken(token)).toBeNull();
  });
});

// ===========================================================================
// verifyEmployeeToken — malformed / tampered / cross-secret
// ===========================================================================
describe('verifyEmployeeToken — rejection matrix', () => {
  it.each([
    ['empty string', ''],
    ['no dot', 'onlyonepart'],
    ['three parts', 'a.b.c'],
    ['empty head', '.somesig'],
    ['empty sig', 'somehead.'],
    ['two dots empty', '.'],
  ])('%s → null', (_label, token) => {
    expect(verifyEmployeeToken(token)).toBeNull();
  });

  it('tampered signature → null', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 100 });
    const head = token.split('.')[0]!;
    expect(verifyEmployeeToken(`${head}.AAAA`)).toBeNull();
  });

  it('tampered payload (re-signed head not matching old sig) → null', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 100 });
    const sig = token.split('.')[1]!;
    const evilHead = b64u(JSON.stringify({ eid: 'attacker', oid: ORG_ID, exp: FIXED_NOW_SEC + 100 }));
    expect(verifyEmployeeToken(`${evilHead}.${sig}`)).toBeNull();
  });

  it('valid structure but signed with WRONG secret → null', () => {
    const token = forge(
      { eid: EMP_ID, oid: ORG_ID, exp: FIXED_NOW_SEC + 100 },
      'totally-different-secret',
    );
    expect(verifyEmployeeToken(token)).toBeNull();
  });

  it('head is valid base64 but NOT JSON → null', () => {
    const head = b64u('this is not json');
    const sig = b64u(createHmac('sha256', SECRET).update(head).digest());
    expect(verifyEmployeeToken(`${head}.${sig}`)).toBeNull();
  });

  it('signature of different (length-mismatched) bytes → null without throw', () => {
    const head = b64u(JSON.stringify({ eid: EMP_ID, oid: ORG_ID, exp: FIXED_NOW_SEC + 100 }));
    // sig that decodes to a short buffer → length mismatch branch
    expect(verifyEmployeeToken(`${head}.${b64u('short')}`)).toBeNull();
  });
});

// ===========================================================================
// issueEmployeePortalToken
// ===========================================================================
describe('issueEmployeePortalToken', () => {
  it('mints a verifiable employee_portal token with 90-day exp', () => {
    const token = issueEmployeePortalToken({ orgId: ORG_ID, employeeId: EMP_ID });
    const decoded = verifyEmployeeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.employeeId).toBe(EMP_ID);
    expect(decoded!.organizationId).toBe(ORG_ID);
    expect(decoded!.intent).toBe('employee_portal');
    expect(decoded!.exp).toBe(FIXED_NOW_SEC + 7776000);
  });

  it('payload carries int=employee_portal', () => {
    const token = issueEmployeePortalToken({ orgId: ORG_ID, employeeId: EMP_ID });
    expect(decodePayload(token).int).toBe('employee_portal');
  });

  it('is idempotent under fixed clock', () => {
    const a = issueEmployeePortalToken({ orgId: ORG_ID, employeeId: EMP_ID });
    const b = issueEmployeePortalToken({ orgId: ORG_ID, employeeId: EMP_ID });
    expect(a).toBe(b);
  });
});

// ===========================================================================
// signPosterToken / verifyPosterToken
// ===========================================================================
describe('signPosterToken — structure', () => {
  it('payload encodes sid/oid/int=poster and exp = now + 7 days by default', () => {
    const token = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID });
    const p = decodePayload(token);
    expect(p.sid).toBe(SCHED_ID);
    expect(p.oid).toBe(ORG_ID);
    expect(p.int).toBe('poster');
    expect(p.exp).toBe(FIXED_NOW_SEC + 604800); // 7 days
  });

  it.each([
    [1, FIXED_NOW_SEC + 1],
    [3600, FIXED_NOW_SEC + 3600],
    [604800, FIXED_NOW_SEC + 604800],
  ])('ttlSeconds=%d → exp=%d', (ttl, expectedExp) => {
    const token = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: ttl });
    expect(decodePayload(token).exp).toBe(expectedExp);
  });

  it('idempotent under fixed clock', () => {
    const a = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: 50 });
    const b = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: 50 });
    expect(a).toBe(b);
  });
});

describe('verifyPosterToken — valid', () => {
  it('round-trips scheduleId / organizationId / exp', () => {
    const token = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: 1000 });
    const decoded = verifyPosterToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.scheduleId).toBe(SCHED_ID);
    expect(decoded!.organizationId).toBe(ORG_ID);
    expect(decoded!.exp).toBe(FIXED_NOW_SEC + 1000);
  });

  it('passes when expectedScheduleId matches', () => {
    const token = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: 1000 });
    expect(verifyPosterToken(token, SCHED_ID)).not.toBeNull();
  });

  it('fails when expectedScheduleId does NOT match', () => {
    const token = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: 1000 });
    expect(verifyPosterToken(token, 'different-schedule')).toBeNull();
  });
});

describe('verifyPosterToken — rejection matrix', () => {
  it.each([
    ['empty', ''],
    ['no dot', 'abc'],
    ['three parts', 'a.b.c'],
    ['empty head', '.x'],
    ['empty sig', 'x.'],
  ])('malformed %s → null', (_label, token) => {
    expect(verifyPosterToken(token)).toBeNull();
  });

  it('wrong intent (employee token) → null', () => {
    // An employee-portal token is validly signed but int !== "poster".
    const token = signEmployeeToken({
      employeeId: EMP_ID,
      organizationId: ORG_ID,
      ttlSeconds: 1000,
      intent: 'employee_portal',
    });
    expect(verifyPosterToken(token)).toBeNull();
  });

  it('missing int → null', () => {
    const token = forge({ sid: SCHED_ID, oid: ORG_ID, exp: FIXED_NOW_SEC + 100 });
    expect(verifyPosterToken(token)).toBeNull();
  });

  it.each([
    ['expired 1s ago', FIXED_NOW_SEC - 1, true],
    ['exp == now → valid', FIXED_NOW_SEC, false],
    ['future → valid', FIXED_NOW_SEC + 100, false],
  ])('expiry %s', (_label, exp, shouldBeNull) => {
    const token = forge({ sid: SCHED_ID, oid: ORG_ID, exp, int: 'poster' });
    const decoded = verifyPosterToken(token);
    if (shouldBeNull) expect(decoded).toBeNull();
    else expect(decoded).not.toBeNull();
  });

  it('missing sid → null', () => {
    const token = forge({ oid: ORG_ID, exp: FIXED_NOW_SEC + 100, int: 'poster' });
    expect(verifyPosterToken(token)).toBeNull();
  });

  it('missing oid → null', () => {
    const token = forge({ sid: SCHED_ID, exp: FIXED_NOW_SEC + 100, int: 'poster' });
    expect(verifyPosterToken(token)).toBeNull();
  });

  it('wrong secret → null', () => {
    const token = forge(
      { sid: SCHED_ID, oid: ORG_ID, exp: FIXED_NOW_SEC + 100, int: 'poster' },
      'nope',
    );
    expect(verifyPosterToken(token)).toBeNull();
  });

  it('tampered signature → null', () => {
    const token = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: 100 });
    const head = token.split('.')[0]!;
    expect(verifyPosterToken(`${head}.AAAA`)).toBeNull();
  });

  it('head not JSON → null', () => {
    const head = b64u('xx not json xx');
    const sig = b64u(createHmac('sha256', SECRET).update(head).digest());
    expect(verifyPosterToken(`${head}.${sig}`)).toBeNull();
  });
});

// ===========================================================================
// Cross-token isolation: employee token must not verify as poster & vice-versa
// ===========================================================================
describe('cross-token isolation', () => {
  it('a poster token is NOT accepted by verifyEmployeeToken as employee_portal', () => {
    const token = signPosterToken({ scheduleId: SCHED_ID, organizationId: ORG_ID, ttlSeconds: 1000 });
    // Signature is valid; verifyEmployeeToken does not check int==poster, so it
    // decodes but eid/oid come from sid-less payload → employeeId undefined.
    const decoded = verifyEmployeeToken(token);
    expect(decoded).not.toBeNull();
    // poster payload has no eid → employeeId is undefined; intent falls to share.
    expect(decoded!.employeeId).toBeUndefined();
    expect(decoded!.intent).toBe('share');
  });

  it('an employee token (share) is rejected by verifyPosterToken (no int=poster)', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 1000 });
    expect(verifyPosterToken(token)).toBeNull();
  });
});

// ===========================================================================
// shareUrlForEmployee
// ===========================================================================
describe('shareUrlForEmployee', () => {
  it('builds {PUBLIC_WEB_URL}/e/{token} exactly', () => {
    expect(shareUrlForEmployee('TKN')).toBe('https://sidor-test.vercel.app/e/TKN');
  });

  it('does not double the slash even though base has no trailing slash', () => {
    const url = shareUrlForEmployee('abc');
    expect(url).not.toContain('//e/');
  });

  it('embeds a real signed token verbatim', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: 10 });
    expect(shareUrlForEmployee(token)).toBe(`https://sidor-test.vercel.app/e/${token}`);
  });
});

// ===========================================================================
// whatsappLinkForPhone — Israeli normalisation matrix
// ===========================================================================
describe('whatsappLinkForPhone', () => {
  const msg = 'hi there';
  const enc = encodeURIComponent(msg); // "hi%20there"

  it.each([
    ['local 05X', '0501234567', '972501234567'],
    ['local with dashes', '050-123-4567', '972501234567'],
    ['local with spaces', '050 123 4567', '972501234567'],
    ['+972 intl', '+972501234567', '972501234567'],
    ['972 no plus', '972501234567', '972501234567'],
    ['parens & dashes intl', '+972 (50) 123-4567', '972501234567'],
    ['leading zero landline 02', '021234567', '97221234567'],
  ])('%s → %s', (_label, input, expectedDigits) => {
    const link = whatsappLinkForPhone(input, msg);
    expect(link).toBe(`https://wa.me/${expectedDigits}?text=${enc}`);
  });

  it('972-prefixed number is not double-prefixed', () => {
    const link = whatsappLinkForPhone('972501234567', msg);
    expect(link).not.toContain('972972');
  });

  it('null phone → wa.me with text only', () => {
    expect(whatsappLinkForPhone(null, msg)).toBe(`https://wa.me/?text=${enc}`);
  });

  it('undefined phone → wa.me with text only', () => {
    expect(whatsappLinkForPhone(undefined, msg)).toBe(`https://wa.me/?text=${enc}`);
  });

  it('empty string phone → wa.me with text only (falsy branch)', () => {
    expect(whatsappLinkForPhone('', msg)).toBe(`https://wa.me/?text=${enc}`);
  });

  it('message is URL-encoded (newlines/emoji safe)', () => {
    const link = whatsappLinkForPhone('0501234567', 'a\nb');
    expect(link).toContain(`text=${encodeURIComponent('a\nb')}`);
    expect(link).not.toContain('\n');
  });
});

// ===========================================================================
// buildPublishBundle — DB-injected fake
// ===========================================================================
type SchedRow = { id: string; organizationId: string; periodStartDate: Date };
type EmpRow = { id: string; fullName: string; phone: string | null };

function makeDb(opts: {
  schedule?: SchedRow | null;
  employees?: EmpRow[];
}): Db {
  return {
    schedule: {
      findFirst: jest.fn(async () => opts.schedule ?? null),
    },
    employee: {
      findMany: jest.fn(async () => opts.employees ?? []),
    },
  } as unknown as Db;
}

describe('buildPublishBundle', () => {
  it('throws 404 when schedule not found', async () => {
    const db = makeDb({ schedule: null });
    await expect(
      buildPublishBundle({ scheduleId: SCHED_ID, organizationId: ORG_ID }, db),
    ).rejects.toMatchObject({ message: 'Schedule not found', statusCode: 404 });
  });

  it('computes weekStart/weekEnd as start and start+6 days (UTC ISO date)', async () => {
    // periodStartDate = Sunday 2026-05-24 → end = 2026-05-30
    const db = makeDb({
      schedule: { id: SCHED_ID, organizationId: ORG_ID, periodStartDate: new Date('2026-05-24T00:00:00Z') },
      employees: [],
    });
    const out = await buildPublishBundle({ scheduleId: SCHED_ID, organizationId: ORG_ID }, db);
    expect(out.weekStart).toBe('2026-05-24');
    expect(out.weekEnd).toBe('2026-05-30');
    expect(out.links).toHaveLength(0);
  });

  it('groupMessage references the computed week range', async () => {
    const db = makeDb({
      schedule: { id: SCHED_ID, organizationId: ORG_ID, periodStartDate: new Date('2026-05-24T00:00:00Z') },
      employees: [],
    });
    const out = await buildPublishBundle({ scheduleId: SCHED_ID, organizationId: ORG_ID }, db);
    expect(out.groupMessage).toContain('2026-05-24');
    expect(out.groupMessage).toContain('2026-05-30');
  });

  it('builds one link per employee with verifiable token + wa.me url', async () => {
    const db = makeDb({
      schedule: { id: SCHED_ID, organizationId: ORG_ID, periodStartDate: new Date('2026-05-24T00:00:00Z') },
      employees: [
        { id: EMP_ID, fullName: 'Dana', phone: '0501112222' },
        { id: 'emp-2', fullName: 'Roi', phone: null },
      ],
    });
    const out = await buildPublishBundle({ scheduleId: SCHED_ID, organizationId: ORG_ID }, db);
    expect(out.links).toHaveLength(2);

    const dana = out.links[0]!;
    expect(dana.employeeId).toBe(EMP_ID);
    expect(dana.fullName).toBe('Dana');
    expect(dana.url).toBe(`https://sidor-test.vercel.app/e/${signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID })}`);
    // token in URL verifies and is bound to this employee+org
    const tokenInUrl = dana.url.split('/e/')[1]!;
    const decoded = verifyEmployeeToken(tokenInUrl);
    expect(decoded).not.toBeNull();
    expect(decoded!.employeeId).toBe(EMP_ID);
    expect(decoded!.organizationId).toBe(ORG_ID);
    expect(dana.whatsapp).toContain('972501112222');

    const roi = out.links[1]!;
    expect(roi.phone).toBeNull();
    expect(roi.whatsapp).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });

  it('queries only active employees for the given org', async () => {
    const findMany = jest.fn(async () => [] as EmpRow[]);
    const db = {
      schedule: { findFirst: jest.fn(async () => ({ id: SCHED_ID, organizationId: ORG_ID, periodStartDate: new Date('2026-05-24T00:00:00Z') })) },
      employee: { findMany },
    } as unknown as Db;
    await buildPublishBundle({ scheduleId: SCHED_ID, organizationId: ORG_ID }, db);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID, isActive: true },
      }),
    );
  });
});

// ===========================================================================
// buildRequestLinksBundle
// ===========================================================================
describe('buildRequestLinksBundle', () => {
  it('returns count=0 and empty links when no employees', async () => {
    const db = makeDb({ employees: [] });
    const out = await buildRequestLinksBundle({ organizationId: ORG_ID }, db);
    expect(out.count).toBe(0);
    expect(out.links).toHaveLength(0);
  });

  it('count equals number of employees and each link verifies', async () => {
    const db = makeDb({
      employees: [
        { id: EMP_ID, fullName: 'Dana', phone: '0501112222' },
        { id: 'emp-2', fullName: 'Roi', phone: '0523334444' },
        { id: 'emp-3', fullName: 'Lior', phone: null },
      ],
    });
    const out = await buildRequestLinksBundle({ organizationId: ORG_ID }, db);
    expect(out.count).toBe(3);
    expect(out.links).toHaveLength(3);
    for (const link of out.links) {
      const token = link.url.split('/e/')[1]!;
      const decoded = verifyEmployeeToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.organizationId).toBe(ORG_ID);
      expect(decoded!.intent).toBe('share');
    }
  });

  it('whatsapp link normalises Israeli numbers', async () => {
    const db = makeDb({ employees: [{ id: EMP_ID, fullName: 'Dana', phone: '0501112222' }] });
    const out = await buildRequestLinksBundle({ organizationId: ORG_ID }, db);
    expect(out.links[0]!.whatsapp).toContain('972501112222');
  });
});

// ===========================================================================
// fetchEmployeeView
// ===========================================================================
describe('fetchEmployeeView', () => {
  function viewDb(opts: {
    employee?: { id: string; fullName: string; phone: string | null; email: string | null } | null;
    assignments?: Array<{
      id: string;
      assignmentStatus: string;
      shift: {
        id: string;
        startAtUtc: Date;
        endAtUtc: Date;
        role: { name: string } | null;
        location: { name: string } | null;
      };
    }>;
    org?: { name: string; defaultTimezone: string } | null;
  }): Db {
    return {
      employee: { findFirst: jest.fn(async () => opts.employee ?? null) },
      shiftAssignment: { findMany: jest.fn(async () => opts.assignments ?? []) },
      organization: { findUnique: jest.fn(async () => opts.org ?? null) },
    } as unknown as Db;
  }

  it('throws 404 when employee not found', async () => {
    const db = viewDb({ employee: null });
    await expect(fetchEmployeeView(EMP_ID, ORG_ID, db)).rejects.toMatchObject({
      message: 'Employee not found',
      statusCode: 404,
    });
  });

  it('maps assignments to shift DTOs with ISO times and lowercased status', async () => {
    const db = viewDb({
      employee: { id: EMP_ID, fullName: 'Dana', phone: '0501112222', email: 'd@x.com' },
      org: { name: 'Cafe', defaultTimezone: 'Asia/Jerusalem' },
      assignments: [
        {
          id: 'asg-1',
          assignmentStatus: 'CONFIRMED',
          shift: {
            id: 'sh-1',
            startAtUtc: new Date('2026-06-05T06:00:00Z'),
            endAtUtc: new Date('2026-06-05T14:00:00Z'),
            role: { name: 'Barista' },
            location: { name: 'Main' },
          },
        },
      ],
    });
    const out = await fetchEmployeeView(EMP_ID, ORG_ID, db);
    expect(out.employee.id).toBe(EMP_ID);
    expect(out.organization).toEqual({ name: 'Cafe', defaultTimezone: 'Asia/Jerusalem' });
    expect(out.shifts).toHaveLength(1);
    const s = out.shifts[0]!;
    expect(s.id).toBe('sh-1');
    expect(s.assignmentId).toBe('asg-1');
    expect(s.startsAt).toBe('2026-06-05T06:00:00.000Z');
    expect(s.endsAt).toBe('2026-06-05T14:00:00.000Z');
    expect(s.role).toBe('Barista');
    expect(s.location).toBe('Main');
    expect(s.status).toBe('confirmed');
  });

  it('null role/location map to null', async () => {
    const db = viewDb({
      employee: { id: EMP_ID, fullName: 'Dana', phone: null, email: null },
      org: null,
      assignments: [
        {
          id: 'asg-2',
          assignmentStatus: 'PROPOSED',
          shift: {
            id: 'sh-2',
            startAtUtc: new Date('2026-06-06T07:00:00Z'),
            endAtUtc: new Date('2026-06-06T15:00:00Z'),
            role: null,
            location: null,
          },
        },
      ],
    });
    const out = await fetchEmployeeView(EMP_ID, ORG_ID, db);
    expect(out.shifts[0]!.role).toBeNull();
    expect(out.shifts[0]!.location).toBeNull();
    expect(out.shifts[0]!.status).toBe('proposed');
    expect(out.organization).toBeNull();
  });

  it('empty assignment list → empty shifts array', async () => {
    const db = viewDb({
      employee: { id: EMP_ID, fullName: 'Dana', phone: null, email: null },
      org: { name: 'Cafe', defaultTimezone: 'Asia/Jerusalem' },
      assignments: [],
    });
    const out = await fetchEmployeeView(EMP_ID, ORG_ID, db);
    expect(out.shifts).toEqual([]);
  });
});
