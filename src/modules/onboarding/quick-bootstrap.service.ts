/**
 * Quick-bootstrap service for the 60-second Aha onboarding flow.
 *
 * Creates an Organization + Membership(OWNER) + default Location + Roles +
 * placeholder Employees + a week of Shifts in one transaction, then runs the
 * greedy auto-scheduler outside the transaction to materialise assignments.
 *
 * The intent is to give a brand-new user a fully populated, ready-to-edit
 * weekly schedule in <60 seconds with a single form submission.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { SCHEDULE_TEMPLATES, type ScheduleTemplate } from '../templates/schedule-templates.js';
import { SchedulerService } from '../scheduler/scheduler.service.js';
import { findExistingOrgForUser } from './onboarding.service.js';
import { startOfWeek, addDays, format } from 'date-fns';
import { DateTime } from 'luxon';

export interface QuickBootstrapInput {
  userId: string;
  name: string;
  industry: string;
  employeeCount: number;
  /** All optional — when provided, the bootstrap applies the FULL business setup
   * atomically (org name/industry/hours/days/branch + roles) in one server call,
   * so the onboarding client never has to do org-scoped follow-up writes that
   * depend on the JWT already carrying the new org id (a race that left orgs
   * half-configured: empty name, no roles, default hours). */
  timezone?: string;
  branchName?: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  activeDaysOfWeek?: number[];
}

export interface QuickBootstrapResult {
  organizationId: string;
  scheduleId: string;
}

/** Generic 3-role fallback when no industry template exists. */
const GENERIC_TEMPLATE: ScheduleTemplate = {
  id: 'generic',
  name: 'כללי',
  description: '',
  emoji: '🗂️',
  industry: 'other',
  color: 'from-slate-500 to-slate-700',
  weeklyHours: 84,
  roles: ['מנהל', 'עובד', 'מתלמד'],
  shifts: [
    { name: 'בוקר', startTime: '08:00', endTime: '15:00', role: 'עובד', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    { name: 'ערב', startTime: '15:00', endTime: '22:00', role: 'עובד', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
  ],
};

function resolveTemplate(industry: string): ScheduleTemplate {
  // Prefer exact id match, then exact industry match.
  const byId = SCHEDULE_TEMPLATES.find((t) => t.id === industry);
  if (byId) return byId;
  const byIndustry = SCHEDULE_TEMPLATES.find((t) => t.industry === industry);
  if (byIndustry) return byIndustry;
  return GENERIC_TEMPLATE;
}

/**
 * Pick the dominant role from the template — the role assigned to the most
 * shift-days per week. Falls back to the first declared role.
 */
function dominantRole(tpl: ScheduleTemplate): string {
  const counts = new Map<string, number>();
  for (const s of tpl.shifts) {
    counts.set(s.role, (counts.get(s.role) ?? 0) + s.daysOfWeek.length);
  }
  let best = tpl.roles[0] ?? 'עובד';
  let bestCount = -1;
  for (const [role, count] of counts) {
    if (count > bestCount) {
      best = role;
      bestCount = count;
    }
  }
  return best;
}

export async function quickBootstrap(
  input: QuickBootstrapInput,
): Promise<QuickBootstrapResult> {
  const { userId, name, industry, employeeCount } = input;

  const tpl = resolveTemplate(industry);
  const tz = input.timezone?.trim() || 'Asia/Jerusalem';
  // Full business setup persisted on the org up-front (atomic) — see input doc.
  const laborRules: Record<string, string | number[]> = {};
  if (input.businessHoursStart) laborRules['businessHoursStart'] = input.businessHoursStart;
  if (input.businessHoursEnd) laborRules['businessHoursEnd'] = input.businessHoursEnd;
  if (input.activeDaysOfWeek) laborRules['activeDaysOfWeek'] = input.activeDaysOfWeek;
  const branchName = input.branchName?.trim() || 'ראשי';
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = addDays(weekStart, 6);

  // Idempotency: STRICTLY one organization per user. A returning user (or a
  // second device whose JWT lacks the org id) must land on their existing org
  // instead of bootstrapping a duplicate. The previous guard only reused the
  // org when it ALSO had a schedule — so a user whose org had no schedule yet
  // (mid-onboarding, or a failed/cleared schedule) silently got a SECOND
  // organization. We now reuse the existing org unconditionally, creating only
  // a schedule inside it when one is missing. (Matches createOrgForUser.)
  const existing = await findExistingOrgForUser(userId);
  if (existing) {
    if (existing.scheduleId) {
      return { organizationId: existing.orgId, scheduleId: existing.scheduleId };
    }
    const schedule = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${existing.orgId}'`);
      return tx.schedule.create({
        data: {
          organizationId: existing.orgId,
          name: `שבוע ${format(weekStart, 'yyyy-MM-dd')}`,
          periodStartDate: weekStart,
          periodEndDate: weekEnd,
          timezone: tz,
          status: 'DRAFT',
          createdByUserId: userId,
        },
        select: { id: true },
      });
    });
    return { organizationId: existing.orgId, scheduleId: schedule.id };
  }
  const dominantRoleName = dominantRole(tpl);
  const placeholderCount = Math.max(1, Math.min(employeeCount, 200));

  const { organizationId, scheduleId } = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // Generate the org id up-front so we can SET LOCAL app.current_org_id
      // BEFORE the INSERT. Without this, the implicit SELECT after INSERT
      // (RETURNING) is filtered by the RLS USING expression — current_org_id
      // is unset, the new row is invisible, and Prisma throws "no record
      // returned", aborting the whole signup.
      const newOrgId = randomUUID();
      await tx.$executeRawUnsafe(`SET LOCAL app.current_org_id = '${newOrgId}'`);

      const org = await tx.organization.create({
        data: {
          id: newOrgId,
          name: name.trim(),
          defaultTimezone: tz,
          industry: industry.trim(),
          ownerUserId: userId,
          ...(Object.keys(laborRules).length > 0
            ? { laborRulesJsonb: laborRules as Prisma.InputJsonObject }
            : {}),
        },
      });

      await tx.membership.create({
        data: { userId, organizationId: org.id, role: 'OWNER' },
      });

      const location = await tx.location.create({
        data: { organizationId: org.id, name: branchName, timezone: tz },
      });

      // Roles — upsert-by-create since the org is brand new.
      const roleMap = new Map<string, string>();
      for (const roleName of tpl.roles) {
        const r = await tx.role.create({
          data: { organizationId: org.id, name: roleName },
        });
        roleMap.set(roleName, r.id);
      }
      const dominantRoleId = roleMap.get(dominantRoleName) ?? roleMap.values().next().value;

      // Placeholder employees, all tied to the dominant role for the
      // first-pass auto-schedule. The user can rename them later.
      for (let i = 1; i <= placeholderCount; i++) {
        const emp = await tx.employee.create({
          data: {
            organizationId: org.id,
            fullName: `עובד ${i}`,
            employmentType: 'FULL_TIME',
            defaultLocationId: location.id,
            defaultTimezone: tz,
          },
        });
        if (dominantRoleId) {
          await tx.employeeRole.create({
            data: {
              employeeId: emp.id,
              roleId: dominantRoleId,
              isPrimary: true,
            },
          });
        }
      }

      const schedule = await tx.schedule.create({
        data: {
          organizationId: org.id,
          locationId: location.id,
          name: `שבוע ${format(weekStart, 'yyyy-MM-dd')}`,
          periodStartDate: weekStart,
          periodEndDate: weekEnd,
          timezone: tz,
          status: 'DRAFT',
          createdByUserId: userId,
        },
      });

      // Build a week of shifts from the template's shift pattern.
      for (const shiftDef of tpl.shifts) {
        const roleId = roleMap.get(shiftDef.role);
        if (!roleId) continue;

        for (const dow of shiftDef.daysOfWeek) {
          const shiftDate = addDays(weekStart, dow);
          const dateStr = format(shiftDate, 'yyyy-MM-dd');

          // Build start/end in the ORG timezone (Luxon), matching
          // weekly-template.service + operating-hours.service. The previous
          // `new Date("YYYY-MM-DDTHH:mm:00")` parsed in the SERVER's local zone
          // (UTC on Vercel), so bootstrap shifts landed 2-3h off from every
          // later-built week — breaking the grid's template-match comparison
          // and triggering a spurious rebuild dialog.
          const start = DateTime.fromISO(`${dateStr}T${shiftDef.startTime}`, { zone: tz });
          let end = DateTime.fromISO(`${dateStr}T${shiftDef.endTime}`, { zone: tz });
          if (end <= start) end = end.plus({ days: 1 }); // crosses midnight

          await tx.shift.create({
            data: {
              organizationId: org.id,
              scheduleId: schedule.id,
              locationId: location.id,
              roleId,
              startAtUtc: start.toUTC().toJSDate(),
              endAtUtc: end.toUTC().toJSDate(),
              timezone: tz,
              localStartDate: new Date(`${dateStr}T00:00:00Z`),
              localEndDate: new Date(`${end.toFormat('yyyy-MM-dd')}T00:00:00Z`),
              status: 'PLANNED',
              requiredEmployeeCount: 1,
            },
          });
        }
      }

      return { organizationId: org.id, scheduleId: schedule.id };
    },
    { timeout: 14_000 },
  );

  // Best-effort auto-schedule outside the bootstrap transaction. Failure here
  // should not break the onboarding — the user simply sees an empty grid.
  try {
    const svc = new SchedulerService(prisma);
    const output = await svc.run({ scheduleId, dryRun: false }, 'greedy');
    if (output.proposals.length > 0) {
      await svc.applyProposals(
        scheduleId,
        output.proposals.map((p) => ({
          shiftId: p.shiftId,
          employeeId: p.employeeId,
          score: p.score,
        })),
        userId,
        organizationId,
      );
    }
  } catch {
    // swallow — schedule still exists, user can auto-schedule again from UI.
  }

  // Best-effort Supabase Admin metadata sync — mirrors createOrgForUser so the
  // next JWT refresh carries the org id.
  const adminUrl = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (adminUrl && serviceKey) {
    try {
      await fetch(`${adminUrl}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          app_metadata: { organization_id: organizationId, role: 'OWNER' },
        }),
      });
    } catch {
      // swallow — JWT will catch up on next refresh.
    }
  }

  return { organizationId, scheduleId };
}
