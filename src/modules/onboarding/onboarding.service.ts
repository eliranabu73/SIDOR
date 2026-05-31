/**
 * Onboarding service — create-org flow + /me lookup.
 *
 * Single Prisma transaction creates Organization + default Location +
 * empty draft Schedule for current week + Membership(OWNER) for the
 * requesting user. After the tx commits, best-effort updates the user's
 * Supabase app_metadata.organization_id so the next JWT carries it
 * (the Custom Access Token Hook is the canonical source — this is a
 * fallback for environments where the hook isn't installed yet).
 */
import { randomUUID } from 'node:crypto';
import { prisma, withAdminContext, type Db } from '../../db/prisma.js';

export interface CreateOrgInput {
  userId: string;
  name: string;
  defaultTimezone?: string;
  industry?: string;
  defaultLocationName?: string;
}

export interface CreateOrgResult {
  orgId: string;
  scheduleId: string;
  membershipId: string;
}

export interface MeMembershipRow {
  orgId: string;
  orgName: string;
  role: 'OWNER' | 'MANAGER' | 'BRANCH_MANAGER';
}

/** Return Sunday-start week boundaries in UTC for the current instant. */
function currentWeekRange(now = new Date()): { start: Date; end: Date } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - dow);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { start, end };
}

export async function listMemberships(userId: string, db: Db = prisma): Promise<MeMembershipRow[]> {
  const rows = await (db as typeof prisma).membership.findMany({
    where: { userId },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    orgId: r.organization.id,
    orgName: r.organization.name,
    role: r.role,
  }));
}

/**
 * One-org-per-user invariant. Returns the user's existing organization (and a
 * schedule to land on) if they already have a membership, else null. Uses the
 * admin RLS context because the caller has no org context set yet — without it
 * the membership row is filtered out by RLS and we'd wrongly create a 2nd org.
 */
export async function findExistingOrgForUser(
  userId: string,
): Promise<{ orgId: string; scheduleId: string | null; membershipId: string } | null> {
  return withAdminContext().query(async (tx) => {
    const membership = await tx.membership.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) return null;
    const schedule = await tx.schedule.findFirst({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return {
      orgId: membership.organizationId,
      scheduleId: schedule?.id ?? null,
      membershipId: membership.id,
    };
  });
}

export async function createOrgForUser(input: CreateOrgInput): Promise<CreateOrgResult> {
  // Idempotency: one organization per user. If the user already onboarded
  // (possibly from another device), return that org instead of creating a new
  // one — otherwise a flaky /v1/me or a second device spawns a duplicate org.
  const existing = await findExistingOrgForUser(input.userId);
  if (existing) {
    return {
      orgId: existing.orgId,
      scheduleId: existing.scheduleId ?? '',
      membershipId: existing.membershipId,
    };
  }

  const tz = input.defaultTimezone || 'Asia/Jerusalem';
  const week = currentWeekRange();

  const result = await prisma.$transaction(async (tx) => {
    // Generate the org id up-front and SET LOCAL app.current_org_id BEFORE
    // the INSERT. Without this, the implicit SELECT after INSERT (RETURNING)
    // is filtered by RLS — current_org_id is unset, no rows match, Prisma
    // throws "no record returned", and the whole onboarding aborts.
    const newOrgId = randomUUID();
    await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${newOrgId}'`);

    const org = await tx.organization.create({
      data: {
        id: newOrgId,
        name: input.name.trim(),
        defaultTimezone: tz,
        industry: input.industry?.trim() || null,
        ownerUserId: input.userId,
      },
    });

    await tx.location.create({
      data: {
        organizationId: org.id,
        name: input.defaultLocationName?.trim() || 'ראשי',
        timezone: tz,
      },
    });

    const schedule = await tx.schedule.create({
      data: {
        organizationId: org.id,
        name: `שבוע ${week.start.toISOString().slice(0, 10)}`,
        periodStartDate: week.start,
        periodEndDate: week.end,
        timezone: tz,
        status: 'DRAFT',
        createdByUserId: input.userId,
      },
    });

    const membership = await tx.membership.create({
      data: {
        userId: input.userId,
        organizationId: org.id,
        role: 'OWNER',
      },
    });

    return { orgId: org.id, scheduleId: schedule.id, membershipId: membership.id };
  });

  // Best-effort Supabase Admin update so a fresh-token-refresh sees the orgId.
  // The DB-side Custom Access Token hook is the canonical source.
  const adminUrl = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (adminUrl && serviceKey) {
    try {
      await fetch(`${adminUrl}/auth/v1/admin/users/${input.userId}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          app_metadata: { organization_id: result.orgId, role: 'OWNER' },
        }),
      });
    } catch {
      // swallow — hook will catch it on next session refresh
    }
  }

  return result;
}
