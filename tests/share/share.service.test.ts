/**
 * Unit tests for share.service — token signing/verification and helper functions.
 *
 * No DB required — all functions under test are pure (HMAC / string manipulation).
 */

// Mock the env and prisma modules to avoid side-effects from module init.
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
  shareUrlForEmployee,
  whatsappLinkForPhone,
} from '../../src/modules/share/share.service';

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const EMP_ID = '20000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Token sign + verify round-trip
// ---------------------------------------------------------------------------
describe('signEmployeeToken + verifyEmployeeToken', () => {
  it('roundtrip: מחזיר את ה-employeeId ו-organizationId המקוריים', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID });
    const decoded = verifyEmployeeToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.employeeId).toBe(EMP_ID);
    expect(decoded!.organizationId).toBe(ORG_ID);
  });

  it('roundtrip: שדה exp נמצא ומוגדר לעתיד', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID });
    const decoded = verifyEmployeeToken(token);
    expect(decoded).not.toBeNull();
    expect(typeof decoded!.exp).toBe('number');
    expect(decoded!.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('חתימה שגויה מחזירה null', () => {
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID });
    // Tamper the signature part
    const parts = token.split('.');
    const tampered = `${parts[0]}.BAD_SIGNATURE_XXXX`;
    expect(verifyEmployeeToken(tampered)).toBeNull();
  });

  it('טוקן שפג תוקפו מחזיר null', () => {
    // ttlSeconds = -60 → expired 60 seconds ago
    const token = signEmployeeToken({ employeeId: EMP_ID, organizationId: ORG_ID, ttlSeconds: -60 });
    expect(verifyEmployeeToken(token)).toBeNull();
  });

  it('טוקן בפורמט לא תקין מחזיר null', () => {
    expect(verifyEmployeeToken('not-a-valid-token')).toBeNull();
    expect(verifyEmployeeToken('')).toBeNull();
    expect(verifyEmployeeToken('onlyonepart')).toBeNull();
  });

  it('פayload שגוי (לא JSON) מחזיר null', () => {
    // Build a token whose head is not valid JSON
    const badHead = Buffer.from('not-json').toString('base64url');
    // Use any string as sig — it will fail sig check first, which is fine
    expect(verifyEmployeeToken(`${badHead}.somesig`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shareUrlForEmployee
// ---------------------------------------------------------------------------
describe('shareUrlForEmployee', () => {
  it('מחזיר כתובת URL עם הטוקן', () => {
    const url = shareUrlForEmployee('abc123');
    expect(url).toContain('abc123');
    expect(url).toMatch(/^https?:\/\//);
    expect(url).toContain('/e/');
  });
});

// ---------------------------------------------------------------------------
// whatsappLinkForPhone — normalisation of Israeli phone numbers
// ---------------------------------------------------------------------------
describe('whatsappLinkForPhone', () => {
  const msg = 'hello';

  it('מנרמל מספר ישראלי מקומי 05X ל-9725X', () => {
    const link = whatsappLinkForPhone('0501234567', msg);
    expect(link).toContain('972501234567');
  });

  it('מנרמל מספר עם קידומת +972 (מסיר את ה-+)', () => {
    const link = whatsappLinkForPhone('+972501234567', msg);
    // The function strips non-digit chars; +972... → 972501234567
    expect(link).toContain('972501234567');
  });

  it('מספר שכבר מתחיל ב-972 לא משתנה', () => {
    const link = whatsappLinkForPhone('972501234567', msg);
    expect(link).toContain('972501234567');
    // Should NOT have 972972...
    expect(link).not.toContain('972972');
  });

  it('מספר null מחזיר wa.me ללא מספר', () => {
    const link = whatsappLinkForPhone(null, msg);
    expect(link).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});
