/**
 * Platform-admin routes — cross-tenant dashboard for the SaaS owner.
 *
 * Mounted at /v1/admin in src/app.ts. All routes:
 *   1. Run `app.authenticate` (valid JWT required).
 *   2. Call `isPlatformAdmin(req)` — returns 403 if the user's email is not
 *      in the platform-admin allowlist (PLATFORM_ADMIN_EMAILS env var).
 *   3. Use `withAdminContext()` to bypass RLS for cross-tenant queries.
 *
 * IMPORTANT: These routes BYPASS RLS. Never expose them to org-level OWNER
 * users — only to the SaaS platform owner.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withAdminContext } from '../../db/prisma.js';
import { isPlatformAdmin } from './admin.middleware.js';

function forbidden(reply: FastifyReply): FastifyReply {
  return reply.code(403).send({
    code: 'FORBIDDEN_NOT_PLATFORM_ADMIN',
    message: 'Platform admin privileges required',
  });
}

function ensureAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): boolean {
  if (!isPlatformAdmin(req)) {
    forbidden(reply);
    return false;
  }
  return true;
}

const ListQuery = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const AuditQuery = z.object({
  orgId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const auth = [app.authenticate];

  // -------------------------------------------------------------------------
  // /v1/admin/check — lightweight gate used by the frontend AdminGuard.
  // Returns { isAdmin: boolean }. Never 403s (so the UI can decide what to do).
  // -------------------------------------------------------------------------
  app.get('/check', { preHandler: auth }, async (req) => {
    return { isAdmin: isPlatformAdmin(req) };
  });

  // -------------------------------------------------------------------------
  // /v1/admin/stats — top-line metrics across all tenants.
  // -------------------------------------------------------------------------
  app.get('/stats', { preHandler: auth }, async (req, reply) => {
    if (!ensureAdmin(req, reply)) return;

    const db = withAdminContext();
    return db.query(async (tx) => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalOrgs,
        totalEmployees,
        totalShifts,
        signupsLast7d,
        shiftsLast7d,
        activeOrgsRows,
        totalUsersRows,
      ] = await Promise.all([
        tx.organization.count(),
        tx.employee.count(),
        tx.shift.count(),
        tx.organization.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        tx.shift.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(DISTINCT organization_id)::bigint AS count
             FROM schedule_audit_logs
            WHERE created_at >= NOW() - INTERVAL '7 days'`,
        ),
        tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(DISTINCT user_id)::bigint AS count FROM memberships`,
        ),
      ]);

      return {
        totalOrgs,
        totalUsers: Number(totalUsersRows[0]?.count ?? 0),
        totalEmployees,
        totalShifts,
        signupsLast7d,
        shiftsLast7d,
        activeOrgsLast7d: Number(activeOrgsRows[0]?.count ?? 0),
      };
    });
  });

  // -------------------------------------------------------------------------
  // /v1/admin/orgs — paginated, searchable list of organizations.
  // -------------------------------------------------------------------------
  app.get(
    '/orgs',
    { preHandler: auth, schema: { querystring: ListQuery } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const q = req.query as z.infer<typeof ListQuery>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const where = q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' as const } },
                { industry: { contains: q.search, mode: 'insensitive' as const } },
              ],
            }
          : {};

        const [total, orgs] = await Promise.all([
          tx.organization.count({ where }),
          tx.organization.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: q.limit,
            skip: q.offset,
            select: {
              id: true,
              name: true,
              industry: true,
              plan: true,
              createdAt: true,
              _count: {
                select: {
                  memberships: true,
                  employees: true,
                  schedules: true,
                },
              },
            },
          }),
        ]);

        return {
          total,
          limit: q.limit,
          offset: q.offset,
          items: orgs.map((o) => ({
            id: o.id,
            name: o.name,
            industry: o.industry,
            plan: o.plan,
            createdAt: o.createdAt,
            memberCount: o._count.memberships,
            employeeCount: o._count.employees,
            scheduleCount: o._count.schedules,
          })),
        };
      });
    },
  );

  // -------------------------------------------------------------------------
  // /v1/admin/orgs/:id — single org detail.
  // -------------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    '/orgs/:id',
    {
      preHandler: auth,
      schema: { params: z.object({ id: z.string().uuid() }) },
    },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { id } = req.params;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const org = await tx.organization.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            industry: true,
            plan: true,
            planRenewsAt: true,
            defaultTimezone: true,
            ownerUserId: true,
            createdAt: true,
            updatedAt: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            _count: {
              select: {
                memberships: true,
                employees: true,
                schedules: true,
                shifts: true,
                locations: true,
              },
            },
            memberships: {
              orderBy: { createdAt: 'asc' },
              select: { id: true, userId: true, role: true, createdAt: true },
            },
          },
        });
        if (!org) {
          return reply
            .code(404)
            .send({ code: 'ORG_NOT_FOUND', message: 'Organization not found' });
        }

        const recentSchedules = await tx.schedule.findMany({
          where: { organizationId: id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            name: true,
            status: true,
            periodStartDate: true,
            periodEndDate: true,
            createdAt: true,
            publishedAt: true,
          },
        });

        return { org, recentSchedules };
      });
    },
  );

  // -------------------------------------------------------------------------
  // /v1/admin/users — paginated user listing built from `memberships`.
  // We can't easily reach auth.users without service-role; expose user_id
  // plus their org list for now.
  // -------------------------------------------------------------------------
  app.get(
    '/users',
    { preHandler: auth, schema: { querystring: ListQuery } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const q = req.query as z.infer<typeof ListQuery>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        // Group memberships by userId, paginate users, then load orgs per user.
        const grouped = await tx.$queryRawUnsafe<
          Array<{ user_id: string; org_count: bigint; first_joined: Date }>
        >(
          `SELECT user_id,
                  COUNT(*)::bigint AS org_count,
                  MIN(created_at) AS first_joined
             FROM memberships
            GROUP BY user_id
            ORDER BY first_joined DESC
            LIMIT $1 OFFSET $2`,
          q.limit,
          q.offset,
        );

        const totalRow = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(DISTINCT user_id)::bigint AS count FROM memberships`,
        );

        const userIds = grouped.map((g) => g.user_id);
        const memberships = userIds.length
          ? await tx.membership.findMany({
              where: { userId: { in: userIds } },
              select: {
                userId: true,
                role: true,
                createdAt: true,
                organization: { select: { id: true, name: true } },
              },
            })
          : [];

        const byUser = new Map<string, typeof memberships>();
        for (const m of memberships) {
          const arr = byUser.get(m.userId) ?? [];
          arr.push(m);
          byUser.set(m.userId, arr);
        }

        return {
          total: Number(totalRow[0]?.count ?? 0),
          limit: q.limit,
          offset: q.offset,
          items: grouped.map((g) => ({
            userId: g.user_id,
            orgCount: Number(g.org_count),
            firstJoined: g.first_joined,
            memberships: (byUser.get(g.user_id) ?? []).map((m) => ({
              role: m.role,
              joinedAt: m.createdAt,
              org: m.organization,
            })),
          })),
        };
      });
    },
  );

  // -------------------------------------------------------------------------
  // /v1/admin/audit — cross-tenant audit log viewer.
  // -------------------------------------------------------------------------
  app.get(
    '/audit',
    { preHandler: auth, schema: { querystring: AuditQuery } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const q = req.query as z.infer<typeof AuditQuery>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const logs = await tx.scheduleAuditLog.findMany({
          where: q.orgId ? { organizationId: q.orgId } : {},
          orderBy: { createdAt: 'desc' },
          take: q.limit,
          select: {
            id: true,
            organizationId: true,
            scheduleId: true,
            userId: true,
            actionType: true,
            entityType: true,
            entityId: true,
            createdAt: true,
            organization: { select: { name: true } },
          },
        });
        return { items: logs };
      });
    },
  );
}
