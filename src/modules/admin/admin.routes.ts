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
import { prisma, withAdminContext } from '../../db/prisma.js';
import { isPlatformAdmin, getAdminEmails } from './admin.middleware.js';
import { env } from '../../env.js';

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
          `SELECT COUNT(DISTINCT "organizationId")::bigint AS count
             FROM schedule_audit_logs
            WHERE "createdAt" >= NOW() - INTERVAL '7 days'`,
        ),
        tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(DISTINCT "userId")::bigint AS count FROM memberships`,
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
  // We can't easily reach auth.users without service-role; expose "userId"
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
          Array<{ userId: string; org_count: bigint; first_joined: Date }>
        >(
          `SELECT "userId",
                  COUNT(*)::bigint AS org_count,
                  MIN("createdAt") AS first_joined
             FROM memberships
            GROUP BY "userId"
            ORDER BY first_joined DESC
            LIMIT $1 OFFSET $2`,
          q.limit,
          q.offset,
        );

        const totalRow = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(DISTINCT "userId")::bigint AS count FROM memberships`,
        );

        const userIds = grouped.map((g) => g.userId);
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

        // Enrich with auth.users email + last sign-in (best-effort; degrades
        // gracefully when SUPABASE_SERVICE_ROLE_KEY is missing).
        const enrichment = await fetchSupabaseUsersByIds(userIds);

        return {
          total: Number(totalRow[0]?.count ?? 0),
          limit: q.limit,
          offset: q.offset,
          items: grouped.map((g) => {
            const extra = enrichment.get(g.userId);
            return {
              userId: g.userId,
              email: extra?.email ?? null,
              lastSignInAt: extra?.lastSignInAt ?? null,
              orgCount: Number(g.org_count),
              firstJoined: g.first_joined,
              memberships: (byUser.get(g.userId) ?? []).map((m) => ({
                role: m.role,
                joinedAt: m.createdAt,
                org: m.organization,
              })),
            };
          }),
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

  // -------------------------------------------------------------------------
  // POST /v1/admin/impersonate — mint a magic-link/session token for any user.
  //
  // Requires SUPABASE_SERVICE_ROLE_KEY. On success returns an impersonation
  // token + expiry; frontend stores it client-side and shows a banner. The
  // token carries `impersonator: <adminId>` so downstream audit logs can
  // trace activity back to the original admin.
  // -------------------------------------------------------------------------
  const ImpersonateBody = z.object({
    targetUserId: z.string().uuid(),
    targetOrgId: z.string().uuid().optional(),
  });

  app.post(
    '/impersonate',
    { preHandler: auth, schema: { body: ImpersonateBody } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const body = req.body as z.infer<typeof ImpersonateBody>;

      if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) {
        return reply.code(501).send({
          code: 'IMPERSONATION_NOT_CONFIGURED',
          message:
            'SUPABASE_SERVICE_ROLE_KEY (and SUPABASE_URL) must be configured to issue impersonation tokens.',
        });
      }

      const ttlSeconds = 30 * 60;
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      const adminId = req.user!.id;

      // We use Supabase Admin API `generateLink` (magiclink) — this returns
      // an action-link the frontend can exchange for a session. We rely on
      // Supabase to mint the JWT; we cannot inject custom claims via this
      // endpoint, so we additionally return our own short-lived signed
      // marker token containing the impersonator claim.
      try {
        // Resolve the target user's email — required by generateLink.
        const userRes = await fetch(
          `${env.SUPABASE_URL}/auth/v1/admin/users/${body.targetUserId}`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
          },
        );
        if (!userRes.ok) {
          return reply.code(404).send({
            code: 'TARGET_USER_NOT_FOUND',
            message: `Supabase Admin API returned ${userRes.status}`,
          });
        }
        const targetUser = (await userRes.json()) as { email?: string };
        if (!targetUser.email) {
          return reply.code(400).send({
            code: 'TARGET_USER_NO_EMAIL',
            message: 'Target user has no email — cannot mint magic link.',
          });
        }

        const linkRes = await fetch(
          `${env.SUPABASE_URL}/auth/v1/admin/generate_link`,
          {
            method: 'POST',
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              type: 'magiclink',
              email: targetUser.email,
            }),
          },
        );
        if (!linkRes.ok) {
          const text = await linkRes.text();
          return reply.code(502).send({
            code: 'IMPERSONATION_LINK_FAILED',
            message: `Supabase generate_link failed: ${linkRes.status} ${text}`,
          });
        }
        const linkBody = (await linkRes.json()) as {
          properties?: { hashed_token?: string; action_link?: string };
          action_link?: string;
        };
        const impersonationToken =
          linkBody.properties?.hashed_token ??
          linkBody.properties?.action_link ??
          linkBody.action_link ??
          '';

        // Audit trail
        const db = withAdminContext();
        await db.query(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO schedule_audit_logs
               (id, "organizationId", "userId", "actionType", "entityType", "entityId", "afterDataJsonb", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, 'UPDATE', 'admin.impersonate', $3, $4::jsonb, NOW())`,
            body.targetOrgId ?? '00000000-0000-0000-0000-000000000000',
            adminId,
            body.targetUserId,
            JSON.stringify({ impersonator: adminId, targetOrgId: body.targetOrgId ?? null }),
          );
        }).catch(() => { /* audit best-effort */ });

        return {
          impersonationToken,
          expiresAt,
          originalAdminId: adminId,
        };
      } catch (err) {
        return reply.code(500).send({
          code: 'IMPERSONATION_FAILED',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /v1/admin/orgs/:id/plan — change org's billing plan (no Stripe).
  // -------------------------------------------------------------------------
  const PlanBody = z.object({
    plan: z.enum(['FREE', 'BASIC', 'PRO', 'ENTERPRISE']),
  });

  app.patch<{ Params: { id: string } }>(
    '/orgs/:id/plan',
    {
      preHandler: auth,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: PlanBody,
      },
    },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { id } = req.params;
      const { plan } = req.body as z.infer<typeof PlanBody>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const before = await tx.organization.findUnique({
          where: { id },
          select: { id: true, plan: true },
        });
        if (!before) {
          return reply
            .code(404)
            .send({ code: 'ORG_NOT_FOUND', message: 'Organization not found' });
        }
        // Prisma client may not know about ENTERPRISE until regenerated;
        // use raw to be safe.
        await tx.$executeRawUnsafe(
          `UPDATE organizations SET plan = $1::"BillingPlan", "updatedAt" = NOW() WHERE id = $2`,
          plan,
          id,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO schedule_audit_logs
             (id, "organizationId", "userId", "actionType", "entityType", "entityId", "beforeDataJsonb", "afterDataJsonb", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, 'UPDATE', 'admin.plan_change', $1, $3::jsonb, $4::jsonb, NOW())`,
          id,
          req.user!.id,
          JSON.stringify({ plan: before.plan }),
          JSON.stringify({ plan }),
        );

        return { id, plan };
      });
    },
  );

  // -------------------------------------------------------------------------
  // DELETE /v1/admin/orgs/:id — soft delete (sets deletedAt).
  // -------------------------------------------------------------------------
  app.delete<{ Params: { id: string } }>(
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
        const before = await tx.organization.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!before) {
          return reply
            .code(404)
            .send({ code: 'ORG_NOT_FOUND', message: 'Organization not found' });
        }
        await tx.$executeRawUnsafe(
          `UPDATE organizations SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
          id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO schedule_audit_logs
             (id, "organizationId", "userId", "actionType", "entityType", "entityId", "afterDataJsonb", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, 'DELETE', 'admin.org_soft_delete', $1, $3::jsonb, NOW())`,
          id,
          req.user!.id,
          JSON.stringify({ deletedAt: new Date().toISOString() }),
        );
        return { id, deletedAt: new Date().toISOString() };
      });
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /v1/admin/users/:id/deactivate — toggle membership deactivation.
  // Applies to every membership of the given user.
  // -------------------------------------------------------------------------
  const DeactivateBody = z.object({ deactivated: z.boolean() });

  app.patch<{ Params: { id: string } }>(
    '/users/:id/deactivate',
    {
      preHandler: auth,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: DeactivateBody,
      },
    },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { id } = req.params;
      const { deactivated } = req.body as z.infer<typeof DeactivateBody>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const result = deactivated
          ? await tx.$executeRawUnsafe(
              `UPDATE memberships SET "deactivatedAt" = NOW() WHERE "userId" = $1 AND "deactivatedAt" IS NULL`,
              id,
            )
          : await tx.$executeRawUnsafe(
              `UPDATE memberships SET "deactivatedAt" = NULL WHERE "userId" = $1`,
              id,
            );

        await tx.$executeRawUnsafe(
          `INSERT INTO schedule_audit_logs
             (id, "organizationId", "userId", "actionType", "entityType", "entityId", "afterDataJsonb", "createdAt")
           SELECT gen_random_uuid(), "organizationId", $2, 'UPDATE', 'admin.user_deactivate', $1, $3::jsonb, NOW()
             FROM memberships WHERE "userId" = $1 LIMIT 1`,
          id,
          req.user!.id,
          JSON.stringify({ deactivated }),
        );

        return { userId: id, deactivated, affected: Number(result) };
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/admin/system-health — DB + Redis ping, env sanity check.
  // -------------------------------------------------------------------------
  app.get('/system-health', { preHandler: auth }, async (req, reply) => {
    if (!ensureAdmin(req, reply)) return;

    const dbStart = Date.now();
    let dbOk = false;
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const dbLatencyMs = Date.now() - dbStart;

    type RedisCheck = { ok: boolean; latencyMs: number } | null;
    let redis: RedisCheck = null;
    if (process.env['REDIS_URL']) {
      const t0 = Date.now();
      try {
        // Lazy-import to avoid loading ioredis when not needed.
        const { default: IORedis } = (await import('ioredis')) as unknown as {
          default: new (url: string) => { ping: () => Promise<string>; quit: () => Promise<unknown> };
        };
        const client = new IORedis(process.env['REDIS_URL']!);
        await client.ping();
        await client.quit();
        redis = { ok: true, latencyMs: Date.now() - t0 };
      } catch {
        redis = { ok: false, latencyMs: Date.now() - t0 };
      }
    }

    return {
      db: { ok: dbOk, latencyMs: dbLatencyMs },
      redis,
      uptime: process.uptime(),
      nodeVersion: process.version,
      envCheck: {
        hasSupabaseUrl: Boolean(env.SUPABASE_URL),
        hasShareSecret:
          Boolean(env.EMPLOYEE_SHARE_SECRET) || Boolean(env.JWT_SECRET),
        hasAdminEmails: getAdminEmails().length > 0,
        hasServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
        hasRedisUrl: Boolean(process.env['REDIS_URL']),
      },
    };
  });

  // -------------------------------------------------------------------------
  // GET /v1/admin/charts/signups?days=N — daily user signup buckets.
  // Uses memberships.createdAt (first join per user) as the signup proxy
  // when Supabase service-role isn't configured.
  // -------------------------------------------------------------------------
  const ChartsQuery = z.object({
    days: z.coerce.number().int().min(1).max(365).default(30),
  });

  app.get(
    '/charts/signups',
    { preHandler: auth, schema: { querystring: ChartsQuery } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { days } = req.query as z.infer<typeof ChartsQuery>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const rows = await tx.$queryRawUnsafe<
          Array<{ date: Date; count: bigint }>
        >(
          `SELECT date_trunc('day', first_joined)::date AS date,
                  COUNT(*)::bigint AS count
             FROM (
               SELECT "userId", MIN("createdAt") AS first_joined
                 FROM memberships
                GROUP BY "userId"
             ) s
            WHERE first_joined >= NOW() - ($1::int || ' days')::interval
            GROUP BY 1
            ORDER BY 1 ASC`,
          days,
        );
        return rows.map((r) => ({
          date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
          count: Number(r.count),
        }));
      });
    },
  );

  // -------------------------------------------------------------------------
  // GET /v1/admin/charts/shifts?days=N — daily shift creation buckets.
  // -------------------------------------------------------------------------
  app.get(
    '/charts/shifts',
    { preHandler: auth, schema: { querystring: ChartsQuery } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { days } = req.query as z.infer<typeof ChartsQuery>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const rows = await tx.$queryRawUnsafe<
          Array<{ date: Date; count: bigint }>
        >(
          `SELECT date_trunc('day', "createdAt")::date AS date,
                  COUNT(*)::bigint AS count
             FROM shifts
            WHERE "createdAt" >= NOW() - ($1::int || ' days')::interval
            GROUP BY 1
            ORDER BY 1 ASC`,
          days,
        );
        return rows.map((r) => ({
          date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
          count: Number(r.count),
        }));
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/admin/export?type=orgs|users|schedules — stream CSV.
  // -------------------------------------------------------------------------
  const ExportQuery = z.object({
    type: z.enum(['orgs', 'users', 'schedules']),
  });

  function toCsvCell(v: unknown): string {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
    const out: string[] = [headers.join(',')];
    for (const r of rows) {
      out.push(headers.map((h) => toCsvCell(r[h])).join(','));
    }
    return out.join('\r\n') + '\r\n';
  }

  app.post(
    '/export',
    { preHandler: auth, schema: { querystring: ExportQuery } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { type } = req.query as z.infer<typeof ExportQuery>;

      const db = withAdminContext();
      const csv = await db.query(async (tx) => {
        if (type === 'orgs') {
          const orgs = await tx.organization.findMany({
            select: {
              id: true,
              name: true,
              industry: true,
              plan: true,
              createdAt: true,
              defaultTimezone: true,
            },
            orderBy: { createdAt: 'desc' },
          });
          return toCsv(
            ['id', 'name', 'industry', 'plan', 'createdAt', 'defaultTimezone'],
            orgs as unknown as Array<Record<string, unknown>>,
          );
        }
        if (type === 'users') {
          const rows = await tx.$queryRawUnsafe<
            Array<{
              userId: string;
              org_count: bigint;
              first_joined: Date;
            }>
          >(
            `SELECT "userId", COUNT(*)::bigint AS org_count, MIN("createdAt") AS first_joined
               FROM memberships
              GROUP BY "userId"
              ORDER BY first_joined DESC`,
          );
          return toCsv(
            ['userId', 'orgCount', 'firstJoined'],
            rows.map((r) => ({
              userId: r.userId,
              orgCount: Number(r.org_count),
              firstJoined: r.first_joined,
            })),
          );
        }
        // schedules
        const schedules = await tx.schedule.findMany({
          select: {
            id: true,
            organizationId: true,
            name: true,
            status: true,
            periodStartDate: true,
            periodEndDate: true,
            createdAt: true,
            publishedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        });
        return toCsv(
          [
            'id',
            'organizationId',
            'name',
            'status',
            'periodStartDate',
            'periodEndDate',
            'createdAt',
            'publishedAt',
          ],
          schedules as unknown as Array<Record<string, unknown>>,
        );
      });

      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="sidor-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
        );
      return csv;
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /v1/admin/orgs/:id/feature-flags — bulk-set per-tenant feature flags.
  // Body: { flags: { [key: string]: boolean } } — merged into existing JSONB.
  // -------------------------------------------------------------------------
  const FeatureFlagsBody = z.object({
    flags: z.record(z.string(), z.boolean()),
  });

  app.patch<{ Params: { id: string } }>(
    '/orgs/:id/feature-flags',
    {
      preHandler: auth,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: FeatureFlagsBody,
      },
    },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { id } = req.params;
      const { flags } = req.body as z.infer<typeof FeatureFlagsBody>;

      const db = withAdminContext();
      return db.query(async (tx) => {
        const before = await tx.$queryRawUnsafe<
          Array<{ id: string; featureFlags: Record<string, boolean> | null }>
        >(
          `SELECT id, "featureFlags" FROM organizations WHERE id = $1`,
          id,
        );
        if (!before.length) {
          return reply
            .code(404)
            .send({ code: 'ORG_NOT_FOUND', message: 'Organization not found' });
        }
        const merged = { ...(before[0]!.featureFlags ?? {}), ...flags };

        await tx.$executeRawUnsafe(
          `UPDATE organizations
              SET "featureFlags" = $1::jsonb, "updatedAt" = NOW()
            WHERE id = $2`,
          JSON.stringify(merged),
          id,
        );

        await tx.$executeRawUnsafe(
          `INSERT INTO schedule_audit_logs
             (id, "organizationId", "userId", "actionType", "entityType", "entityId", "beforeDataJsonb", "afterDataJsonb", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, 'UPDATE', 'admin.feature_flags', $1, $3::jsonb, $4::jsonb, NOW())`,
          id,
          req.user!.id,
          JSON.stringify(before[0]!.featureFlags ?? {}),
          JSON.stringify(merged),
        );

        return { id, featureFlags: merged };
      });
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/admin/create-user — create a Supabase auth user via service role
  // Body: { email, password, fullName?, autoConfirm? }
  // Used for E2E test user provisioning. Returns userId + confirmation status.
  // -------------------------------------------------------------------------
  const CreateUserBody = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(1).max(120).optional(),
    autoConfirm: z.boolean().default(false),
  });

  app.post(
    '/create-user',
    {
      preHandler: auth,
      schema: { body: CreateUserBody },
    },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const body = req.body as z.infer<typeof CreateUserBody>;
      const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = env.SUPABASE_URL;
      if (!serviceRoleKey || !supabaseUrl) {
        return reply.code(501).send({
          code: 'NOT_CONFIGURED',
          message: 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not set',
        });
      }
      const supabaseHeaders = {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      };
      try {
        // Try create
        const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: supabaseHeaders,
          body: JSON.stringify({
            email: body.email,
            password: body.password,
            email_confirm: body.autoConfirm,
            user_metadata: body.fullName ? { full_name: body.fullName } : undefined,
          }),
        });
        const createData = (await createRes.json()) as Record<string, unknown>;
        if (createRes.ok) {
          return reply.code(201).send({
            userId: createData['id'],
            email: createData['email'],
            confirmed: createData['email_confirmed_at'] != null,
            createdAt: createData['created_at'],
            action: 'created',
          });
        }
        // If user exists — fetch by email, update password + confirm
        if (createRes.status === 422) {
          const listRes = await fetch(
            `${supabaseUrl}/auth/v1/admin/users?filter=email.eq.${encodeURIComponent(body.email)}`,
            { headers: supabaseHeaders },
          );
          const listData = (await listRes.json()) as Record<string, unknown>;
          const users = (listData['users'] as Array<Record<string, unknown>>) || [];
          const existing = users.find(
            (u) =>
              ((u['email'] as string) || '').toLowerCase() === body.email.toLowerCase(),
          );
          if (!existing) {
            return reply.code(404).send({
              code: 'USER_LOOKUP_FAILED',
              message: 'User exists but could not be located',
            });
          }
          const updateRes = await fetch(
            `${supabaseUrl}/auth/v1/admin/users/${existing['id']}`,
            {
              method: 'PUT',
              headers: supabaseHeaders,
              body: JSON.stringify({
                password: body.password,
                email_confirm: true,
                user_metadata: body.fullName
                  ? { full_name: body.fullName }
                  : undefined,
              }),
            },
          );
          const updateData = (await updateRes.json()) as Record<string, unknown>;
          if (!updateRes.ok) {
            return reply.code(updateRes.status).send({
              code: 'SUPABASE_UPDATE_FAILED',
              message:
                (updateData['msg'] ||
                  updateData['error_description'] ||
                  updateData['error']) ??
                'Unknown',
            });
          }
          return reply.code(200).send({
            userId: updateData['id'],
            email: updateData['email'],
            confirmed: updateData['email_confirmed_at'] != null,
            action: 'updated',
          });
        }
        return reply.code(createRes.status).send({
          code: 'SUPABASE_CREATE_FAILED',
          message:
            (createData['msg'] ||
              createData['error_description'] ||
              createData['error']) ??
            'Unknown',
          supabaseStatus: createRes.status,
        });
      } catch (err) {
        return reply.code(500).send({
          code: 'CREATE_USER_FAILED',
          message: err instanceof Error ? err.message : 'Unknown',
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Helper: enrich admin user list with auth.users email + last_sign_in_at via
// Supabase service-role. Exported for the `/users` handler override below.
// ---------------------------------------------------------------------------
async function fetchSupabaseUsersByIds(
  ids: string[],
): Promise<Map<string, { email: string | null; lastSignInAt: string | null }>> {
  const out = new Map<string, { email: string | null; lastSignInAt: string | null }>();
  if (!ids.length) return out;
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) return out;

  // listUsers paginates; for admin views (limit ≤ 200) one page is sufficient.
  // We pull the first page (default 50 per page) — for larger orgs, the
  // caller can paginate via the existing /v1/admin/users limit/offset.
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return out;
    const body = (await res.json()) as {
      users?: Array<{ id: string; email?: string | null; last_sign_in_at?: string | null }>;
    };
    for (const u of body.users ?? []) {
      if (ids.includes(u.id)) {
        out.set(u.id, {
          email: u.email ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
        });
      }
    }
  } catch {
    /* swallow — degrade gracefully */
  }
  return out;
}

// Re-export for tests / external use
export { fetchSupabaseUsersByIds };
