import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../shared/errors.js';
import {
  getOrgSettings,
  patchOrgSettings,
  updateRole,
  deleteRole,
  updateLocation,
  deleteLocation,
  listShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
} from './settings.service.js';
import { prisma } from '../../db/prisma.js';
import type { PrismaClient } from '@prisma/client';
import type { MembershipRole } from '@prisma/client';

const DEMO_ORG_ID = '10000000-0000-0000-0000-000000000001';
function orgIdFor(req: { user?: { orgId: string } }): string {
  return req.user?.orgId ?? DEMO_ORG_ID;
}
/** RLS-aware DB handle (falls back to direct prisma in AUTH_DISABLED mode). */
function dbFor(req: { orgPrisma?: { query: <T>(fn: (tx: PrismaClient) => Promise<T>) => Promise<T> } }) {
  return req.orgPrisma ?? { query: <T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> => fn(prisma) };
}

const IdParam = z.object({ id: z.string().uuid() });
const UserIdParam = z.object({ userId: z.string().uuid() });

const PatchMemberRoleBody = z.object({
  role: z.enum(['MANAGER', 'BRANCH_MANAGER']),
  locationId: z.string().uuid().optional(),
});

const LaborRulesSchema = z.object({
  maxHoursDay: z.number().min(1).max(24).optional(),
  maxHoursWeek: z.number().min(1).max(168).optional(),
  minRestHours: z.number().min(0).max(24).optional(),
  shiftTypes: z.array(z.string().min(1).max(60)).optional(),
  businessHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  businessHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  roleRates: z.record(z.string(), z.number().min(0)).optional(),
});

const PatchOrgBody = z.object({
  name: z.string().min(2).max(200).optional(),
  industry: z.string().min(1).max(100).optional(),
  defaultTimezone: z.string().min(3).max(64).optional(),
  weekStartDay: z.number().int().min(0).max(6).optional(),
  logoUrl: z.string().url().max(2000).nullable().optional(),
  laborRules: LaborRulesSchema.optional(),
});

const UpdateRoleBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(200).nullable().optional(),
});

const UpdateLocationBody = z.object({
  name: z.string().min(1).max(120),
  timezone: z.string().min(3).max(64).nullable().optional(),
});

const HHMM = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM');

const ShiftTemplateBody = z.object({
  name: z.string().min(1).max(120),
  startLocalTime: HHMM,
  endLocalTime: HHMM,
  requiredEmployeeCount: z.number().int().min(1).max(99).optional(),
  locationId: z.string().uuid().nullable().optional(),
  roleId: z.string().uuid().nullable().optional(),
  timezone: z.string().min(3).max(64).optional(),
});

const ShiftTemplatePatchBody = ShiftTemplateBody.partial();

const PromoteEmployeeBody = z.object({
  employeeId: z.string().uuid(),
  password: z.string().min(8).max(72),
  role: z.enum(['MANAGER', 'BRANCH_MANAGER']),
  locationId: z.string().uuid().optional(),
});

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  const authHandlers = process.env['AUTH_DISABLED'] === 'true' ? [] : [app.authenticate];

  // GET /v1/settings — full org config
  app.get('/settings', { preHandler: authHandlers }, async (req, reply) => {
    try {
      return reply.send(
        await dbFor(req).query((tx) => getOrgSettings(orgIdFor(req), tx)),
      );
    } catch (err) {
      return handleHttpError(reply, err);
    }
  });

  // PATCH /v1/settings — update org profile + labor rules
  app.patch(
    '/settings',
    { schema: { body: PatchOrgBody }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const body = req.body as z.infer<typeof PatchOrgBody>;
        return reply.send(
          await dbFor(req).query((tx) => patchOrgSettings(orgIdFor(req), body, tx)),
        );
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // PATCH /v1/roles/:id
  app.patch(
    '/roles/:id',
    { schema: { params: IdParam, body: UpdateRoleBody }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        const { name, description } = req.body as z.infer<typeof UpdateRoleBody>;
        return reply.send(
          await dbFor(req).query((tx) => updateRole(orgIdFor(req), id, name, description, tx)),
        );
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // DELETE /v1/roles/:id
  app.delete(
    '/roles/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        await dbFor(req).query((tx) => deleteRole(orgIdFor(req), id, tx));
        return reply.code(204).send();
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // PATCH /v1/locations/:id
  app.patch(
    '/locations/:id',
    { schema: { params: IdParam, body: UpdateLocationBody }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        const { name, timezone } = req.body as z.infer<typeof UpdateLocationBody>;
        return reply.send(
          await dbFor(req).query((tx) => updateLocation(orgIdFor(req), id, name, timezone, tx)),
        );
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // DELETE /v1/locations/:id
  app.delete(
    '/locations/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        await dbFor(req).query((tx) => deleteLocation(orgIdFor(req), id, tx));
        return reply.code(204).send();
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // GET /v1/settings/members — list all memberships for this org (OWNER only).
  app.get('/settings/members', { preHandler: authHandlers }, async (req, reply) => {
    if (req.user?.role !== 'owner' && req.user?.role !== 'OWNER') {
      return reply.code(403).send({
        code: 'FORBIDDEN',
        message: 'Only the owner can view team members',
      });
    }
    try {
      const orgId = orgIdFor(req);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const members = await (prisma.membership as any).findMany({
        where: { organizationId: orgId, deactivatedAt: null },
        select: {
          id: true,
          userId: true,
          role: true,
          locationId: true,
          createdAt: true,
          location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return reply.send(members);
    } catch (err) {
      return handleHttpError(reply, err);
    }
  });

  // GET /v1/settings/shift-templates — owner/manager/branch_manager all may read.
  app.get('/settings/shift-templates', { preHandler: authHandlers }, async (req, reply) => {
    try {
      const orgId = orgIdFor(req);
      return reply.send(await dbFor(req).query((tx) => listShiftTemplates(orgId, tx)));
    } catch (err) {
      return handleHttpError(reply, err);
    }
  });

  // POST /v1/settings/shift-templates — owner/manager only.
  app.post(
    '/settings/shift-templates',
    { schema: { body: ShiftTemplateBody }, preHandler: authHandlers },
    async (req, reply) => {
      if (!hasRole(req, ['owner', 'manager'])) {
        return reply
          .code(403)
          .send({ code: 'FORBIDDEN', message: 'Only owner or manager can create shift templates' });
      }
      try {
        const body = req.body as z.infer<typeof ShiftTemplateBody>;
        const orgId = orgIdFor(req);
        const settings = await dbFor(req).query((tx) => getOrgSettings(orgId, tx));
        return reply.code(201).send(
          await dbFor(req).query((tx) =>
            createShiftTemplate(orgId, body, settings.defaultTimezone, tx),
          ),
        );
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // PATCH /v1/settings/shift-templates/:id
  app.patch(
    '/settings/shift-templates/:id',
    { schema: { params: IdParam, body: ShiftTemplatePatchBody }, preHandler: authHandlers },
    async (req, reply) => {
      if (!hasRole(req, ['owner', 'manager'])) {
        return reply
          .code(403)
          .send({ code: 'FORBIDDEN', message: 'Only owner or manager can update shift templates' });
      }
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        const body = req.body as z.infer<typeof ShiftTemplatePatchBody>;
        return reply.send(
          await dbFor(req).query((tx) => updateShiftTemplate(orgIdFor(req), id, body, tx)),
        );
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // DELETE /v1/settings/shift-templates/:id
  app.delete(
    '/settings/shift-templates/:id',
    { schema: { params: IdParam }, preHandler: authHandlers },
    async (req, reply) => {
      if (!hasRole(req, ['owner', 'manager'])) {
        return reply
          .code(403)
          .send({ code: 'FORBIDDEN', message: 'Only owner or manager can delete shift templates' });
      }
      try {
        const { id } = req.params as z.infer<typeof IdParam>;
        await dbFor(req).query((tx) => deleteShiftTemplate(orgIdFor(req), id, tx));
        return reply.code(204).send();
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // POST /v1/settings/members/from-employee — promote an existing Employee
  // record to a manager role. Creates (or reuses) a Supabase auth user with
  // the employee's email address, then inserts the Membership.
  app.post(
    '/settings/members/from-employee',
    { schema: { body: PromoteEmployeeBody }, preHandler: authHandlers },
    async (req, reply) => {
      if (!hasRole(req, ['owner'])) {
        return reply
          .code(403)
          .send({ code: 'FORBIDDEN', message: 'Only the owner can promote employees to managers' });
      }
      const body = req.body as z.infer<typeof PromoteEmployeeBody>;
      if (body.role === 'BRANCH_MANAGER' && !body.locationId) {
        return reply
          .code(400)
          .send({ code: 'LOCATION_REQUIRED', message: 'BRANCH_MANAGER requires locationId' });
      }
      const orgId = orgIdFor(req);

      try {
        // Load the employee (org-scoped via RLS) and validate email presence.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emp = await dbFor(req).query((tx) =>
          tx.employee.findFirst({ where: { id: body.employeeId, organizationId: orgId } }),
        );
        if (!emp) {
          return reply.code(404).send({ code: 'NOT_FOUND', message: 'Employee not found' });
        }
        if (!emp.email) {
          return reply
            .code(400)
            .send({ code: 'EMPLOYEE_HAS_NO_EMAIL', message: 'לעובד אין כתובת אימייל' });
        }

        const supabaseUserId = await upsertSupabaseUser(emp.email, body.password);

        // Create membership; if one already exists for this user/org, update its role.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const membership = await (prisma.membership as any).upsert({
          where: { userId_organizationId: { userId: supabaseUserId, organizationId: orgId } },
          create: {
            userId: supabaseUserId,
            organizationId: orgId,
            role: body.role as MembershipRole,
            locationId: body.role === 'BRANCH_MANAGER' ? body.locationId : null,
          },
          update: {
            role: body.role as MembershipRole,
            locationId: body.role === 'BRANCH_MANAGER' ? body.locationId : null,
            deactivatedAt: null,
          },
          select: {
            id: true,
            userId: true,
            role: true,
            locationId: true,
            location: { select: { id: true, name: true } },
          },
        });

        // Link employee.userId so the same identity can confirm shifts + manage.
        await dbFor(req).query((tx) =>
          tx.employee.update({ where: { id: emp.id }, data: { userId: supabaseUserId } }),
        );

        return reply.code(201).send({
          member: membership,
          credentials: { email: emp.email, password: body.password },
        });
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );

  // PATCH /v1/settings/members/:userId/role — change a member's role (OWNER only).
  app.patch(
    '/settings/members/:userId/role',
    { schema: { params: UserIdParam, body: PatchMemberRoleBody }, preHandler: authHandlers },
    async (req, reply) => {
      // Only the OWNER can change roles.
      if (req.user?.role !== 'owner' && req.user?.role !== 'OWNER') {
        return reply.code(403).send({
          code: 'FORBIDDEN',
          message: 'Only the owner can change member roles',
        });
      }
      const { userId } = req.params as z.infer<typeof UserIdParam>;
      const { role, locationId } = req.body as z.infer<typeof PatchMemberRoleBody>;
      const orgId = orgIdFor(req);

      // Prevent owner from demoting themselves.
      if (userId === req.user.id) {
        return reply.code(400).send({
          code: 'CANNOT_CHANGE_OWN_ROLE',
          message: 'You cannot change your own role',
        });
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updated = await (prisma.membership as any).update({
          where: { userId_organizationId: { userId, organizationId: orgId } },
          data: {
            role: role as MembershipRole,
            // Clear locationId when switching to MANAGER; set it for BRANCH_MANAGER.
            locationId: role === 'BRANCH_MANAGER' ? (locationId ?? null) : null,
          },
          select: {
            id: true,
            userId: true,
            role: true,
            locationId: true,
            location: { select: { id: true, name: true } },
          },
        });
        return reply.send(updated);
      } catch (err) {
        return handleHttpError(reply, err);
      }
    },
  );
}

function hasRole(req: { user?: { role?: string } }, allowed: string[]): boolean {
  const role = (req.user?.role ?? '').toLowerCase();
  return allowed.includes(role);
}

/**
 * Create a Supabase auth user via the Admin API, reusing an existing user
 * with the same email if one already exists (email is unique in Supabase).
 * Returns the Supabase user id (uuid).
 */
async function upsertSupabaseUser(email: string, password: string): Promise<string> {
  const adminUrl = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!adminUrl || !serviceKey) {
    throw new HttpError(
      500,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase admin credentials are not configured',
    );
  }

  // 1. Try to create a fresh user (email_confirm so the user can log in immediately).
  const createRes = await fetch(`${adminUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (createRes.ok) {
    const created = (await createRes.json()) as { id: string };
    return created.id;
  }

  // 2. On "user already exists", fetch the existing user by email and reuse its id.
  if (createRes.status === 422 || createRes.status === 400) {
    const lookup = await fetch(
      `${adminUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
      },
    );
    if (lookup.ok) {
      const body = (await lookup.json()) as { users?: Array<{ id: string }> };
      const existing = body.users?.[0];
      if (existing) return existing.id;
    }
  }

  const errText = await createRes.text().catch(() => '');
  throw new HttpError(
    createRes.status,
    'SUPABASE_CREATE_FAILED',
    `Failed to create Supabase user: ${errText.slice(0, 200)}`,
  );
}

function handleHttpError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) {
    return reply
      .code(err.statusCode)
      .send({ code: err.code, message: err.message, details: err.details ?? null });
  }
  reply.log.error(err);
  const message = err instanceof Error ? err.message : String(err);
  return reply.code(500).send({ code: 'INTERNAL_ERROR', message });
}
