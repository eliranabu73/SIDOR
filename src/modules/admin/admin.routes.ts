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

/**
 * Checks that the incoming request carries a valid `Authorization: Bearer <ADMIN_SECRET>`
 * header for the raw admin endpoints that don't go through the Supabase JWT flow.
 * Returns true when the caller is allowed to proceed, false (+ sends a reply) otherwise.
 */
function checkAdminSecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const secret = env.ADMIN_SECRET;
  if (!secret) {
    // Fail safe: if ADMIN_SECRET is not configured refuse the call entirely.
    reply.code(503).send({
      code: 'ADMIN_SECRET_NOT_CONFIGURED',
      message: 'ADMIN_SECRET env var is not set — endpoint disabled.',
    });
    return false;
  }
  const authHeader = req.headers['authorization'] ?? '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!provided || provided !== secret) {
    reply.code(401).send({
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header. Require: Authorization: Bearer <ADMIN_SECRET>',
    });
    return false;
  }
  return true;
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
  // POST /v1/admin/e2e-setup — seed a test org for E2E verification.
  // Body: { email, orgName?, industry?, employees?, locationName? }
  // Creates org + membership + location + roles + employees + a schedule.
  // Idempotent on org name + email (returns existing if already provisioned).
  // -------------------------------------------------------------------------
  const E2ESetupBody = z.object({
    email: z.string().email(),
    orgName: z.string().min(2).max(120).default('חנות סלולר אלירן'),
    industry: z.string().max(40).default('retail'),
    locationName: z.string().min(1).max(80).default('סניף מרכזי'),
    timezone: z.string().default('Asia/Jerusalem'),
    roles: z.array(z.string().min(1).max(80)).default([
      'מנהל חנות',
      'מוכר',
      'טכנאי',
    ]),
    employees: z
      .array(
        z.object({
          fullName: z.string().min(1).max(120),
          phone: z.string().max(40).nullable().default(null),
          email: z.string().email().nullable().default(null),
          roles: z.array(z.string()).default([]),
        }),
      )
      .default([
        { fullName: 'אלירן (מנהל)', phone: '0523736241', email: null, roles: ['מנהל חנות'] },
        { fullName: 'דנה כהן', phone: '0501112233', email: null, roles: ['מוכר'] },
        { fullName: 'יוסי לוי', phone: '0502223344', email: null, roles: ['מוכר', 'טכנאי'] },
        { fullName: 'מאיה רביב', phone: '0503334455', email: null, roles: ['מוכר'] },
        { fullName: 'אבי גרין', phone: '0504445566', email: null, roles: ['טכנאי'] },
      ]),
  });

  app.post(
    '/e2e-setup',
    { preHandler: auth, schema: { body: E2ESetupBody } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const body = req.body as z.infer<typeof E2ESetupBody>;
      const srk = env.SUPABASE_SERVICE_ROLE_KEY;
      const sbu = env.SUPABASE_URL;
      if (!srk || !sbu) {
        return reply.code(501).send({
          code: 'NOT_CONFIGURED',
          message: 'SUPABASE_SERVICE_ROLE_KEY/SUPABASE_URL required',
        });
      }
      // 1) Resolve userId from Supabase by email
      let targetUserId: string | null = null;
      for (let page = 1; page <= 20 && !targetUserId; page++) {
        const r = await fetch(
          `${sbu}/auth/v1/admin/users?page=${page}&per_page=200`,
          {
            headers: {
              apikey: srk,
              Authorization: `Bearer ${srk}`,
            },
          },
        );
        const data = (await r.json()) as Record<string, unknown>;
        const users = (data['users'] as Array<Record<string, unknown>>) || [];
        const m = users.find(
          (u) =>
            ((u['email'] as string) || '').toLowerCase() ===
            body.email.toLowerCase(),
        );
        if (m) targetUserId = m['id'] as string;
        if (users.length < 200) break;
      }
      if (!targetUserId) {
        return reply.code(404).send({
          code: 'USER_NOT_FOUND',
          message: `No Supabase user with email ${body.email}`,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          // 2) Find or create org
          let org = await tx.organization.findFirst({
            where: { name: body.orgName, ownerUserId: targetUserId! },
          });
          if (!org) {
            org = await tx.organization.create({
              data: {
                name: body.orgName,
                industry: body.industry,
                defaultTimezone: body.timezone,
                ownerUserId: targetUserId!,
                weekStartDay: 0,
                plan: 'FREE',
              },
            });
          }
          // 3) Membership (idempotent via @@unique([userId, organizationId]))
          await tx.membership.upsert({
            where: {
              userId_organizationId: {
                userId: targetUserId!,
                organizationId: org.id,
              },
            },
            update: { role: 'OWNER' },
            create: {
              userId: targetUserId!,
              organizationId: org.id,
              role: 'OWNER',
            },
          });
          // 4) Location
          let loc = await tx.location.findFirst({
            where: { organizationId: org.id, name: body.locationName },
          });
          if (!loc) {
            loc = await tx.location.create({
              data: {
                organizationId: org.id,
                name: body.locationName,
                timezone: body.timezone,
              },
            });
          }
          // 5) Roles
          const roleRecords: Record<string, string> = {};
          for (const roleName of body.roles) {
            let role = await tx.role.findFirst({
              where: { organizationId: org.id, name: roleName },
            });
            if (!role) {
              role = await tx.role.create({
                data: { organizationId: org.id, name: roleName },
              });
            }
            roleRecords[roleName] = role.id;
          }
          // 6) Employees
          const employeeRecords: Array<{ id: string; fullName: string; phone: string | null }> = [];
          for (const e of body.employees) {
            let emp = await tx.employee.findFirst({
              where: { organizationId: org.id, fullName: e.fullName },
            });
            if (!emp) {
              emp = await tx.employee.create({
                data: {
                  organizationId: org.id,
                  fullName: e.fullName,
                  email: e.email,
                  phone: e.phone,
                  isActive: true,
                  defaultLocationId: loc.id,
                  roles: {
                    create: e.roles
                      .map((rn) => roleRecords[rn])
                      .filter((v): v is string => !!v)
                      .map((roleId) => ({ roleId })),
                  },
                },
              });
            }
            employeeRecords.push({
              id: emp.id,
              fullName: emp.fullName,
              phone: emp.phone,
            });
          }
          // 7) Schedule for current week (Sunday-based)
          const today = new Date();
          const dayOfWeek = today.getUTCDay();
          const weekStart = new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - dayOfWeek),
          );
          const weekEnd = new Date(weekStart.getTime() + 6 * 86400_000);
          let schedule = await tx.schedule.findFirst({
            where: { organizationId: org.id, periodStartDate: weekStart },
          });
          if (!schedule) {
            schedule = await tx.schedule.create({
              data: {
                organizationId: org.id,
                locationId: loc.id,
                name: `שבוע ${weekStart.toISOString().slice(0, 10)}`,
                periodStartDate: weekStart,
                periodEndDate: weekEnd,
                timezone: body.timezone,
                status: 'DRAFT',
              },
            });
          }
          return {
            orgId: org.id,
            orgName: org.name,
            userId: targetUserId,
            locationId: loc.id,
            roleIds: roleRecords,
            employees: employeeRecords,
            scheduleId: schedule.id,
            weekStart: weekStart.toISOString().slice(0, 10),
          };
        });
        return reply.send(result);
      } catch (err) {
        return reply.code(500).send({
          code: 'E2E_SETUP_FAILED',
          message: err instanceof Error ? err.message.slice(0, 500) : 'Unknown',
        });
      }
    },
  );

  // -------------------------------------------------------------------------
  // POST /v1/admin/apply-schema-migrations — idempotent ALTER TABLEs for
  // admin v2 + RLS. Safe to run multiple times (uses IF NOT EXISTS).
  // Protected by ADMIN_SECRET bearer token.
  // -------------------------------------------------------------------------
  app.post('/apply-schema-migrations', async (req, reply) => {
    if (!checkAdminSecret(req, reply)) return;
    const results: Array<{ stmt: string; ok: boolean; error?: string }> = [];
    const statements = [
      // Admin v2 columns
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ NULL`,
      `ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "featureFlags" JSONB NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMPTZ NULL`,
      `CREATE INDEX IF NOT EXISTS "idx_orgs_deleted_at" ON "organizations"("deletedAt") WHERE "deletedAt" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS "idx_memberships_deactivated_at" ON "memberships"("deactivatedAt") WHERE "deactivatedAt" IS NOT NULL`,
      // Add ENTERPRISE to BillingPlan enum if missing (idempotent via DO block)
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ENTERPRISE' AND enumtypid = 'BillingPlan'::regtype) THEN ALTER TYPE "BillingPlan" ADD VALUE 'ENTERPRISE'; END IF; END $$`,
      // RLS — enable on org-scoped tables
      `ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON "organizations"`,
      `CREATE POLICY tenant_isolation ON "organizations" USING (id::text = current_setting('app.current_org_id', true))`,
      `ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON "memberships"`,
      `CREATE POLICY tenant_isolation ON "memberships" USING ("organizationId"::text = current_setting('app.current_org_id', true))`,
      `ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON "locations"`,
      `CREATE POLICY tenant_isolation ON "locations" USING ("organizationId"::text = current_setting('app.current_org_id', true))`,
      `ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON "roles"`,
      `CREATE POLICY tenant_isolation ON "roles" USING ("organizationId"::text = current_setting('app.current_org_id', true))`,
      `ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON "employees"`,
      `CREATE POLICY tenant_isolation ON "employees" USING ("organizationId"::text = current_setting('app.current_org_id', true))`,
      `ALTER TABLE "schedules" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON "schedules"`,
      `CREATE POLICY tenant_isolation ON "schedules" USING ("organizationId"::text = current_setting('app.current_org_id', true))`,
      `ALTER TABLE "shifts" ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS tenant_isolation ON "shifts"`,
      `CREATE POLICY tenant_isolation ON "shifts" USING ("organizationId"::text = current_setting('app.current_org_id', true))`,
      // v2.0 Sprint 2 — Employee compliance + cost fields
      `DO $$ BEGIN CREATE TYPE "WeeklyRestDay" AS ENUM ('FRIDAY','SATURDAY','SUNDAY'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
      `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "weeklyBudgetHours" INTEGER NULL`,
      `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE NULL`,
      `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "weeklyRestDay" "WeeklyRestDay" NOT NULL DEFAULT 'SATURDAY'`,
      // Extended employee preferences (manager-side constraints UI)
      `ALTER TABLE "employee_preferences" ADD COLUMN IF NOT EXISTS "preferredShiftLength" INTEGER NULL`,
      `ALTER TABLE "employee_preferences" ADD COLUMN IF NOT EXISTS "noWorkAfter" VARCHAR(8) NULL`,
      `ALTER TABLE "employee_preferences" ADD COLUMN IF NOT EXISTS "noWorkBefore" VARCHAR(8) NULL`,
      `ALTER TABLE "employee_preferences" ADD COLUMN IF NOT EXISTS "avoidWeekends" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "employee_preferences" ADD COLUMN IF NOT EXISTS "avoidNightShifts" BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE "employee_preferences" ADD COLUMN IF NOT EXISTS "notes" TEXT NULL`,
      // 20260525170000_admin_rls_bypass — teach every tenant_isolation
      // policy to also match when app.current_org_id = '*' (platform-admin
      // sentinel). Idempotent: drops + recreates each existing policy.
      `DO $$
       DECLARE
         r RECORD;
         policy_name TEXT := 'tenant_isolation';
         org_col TEXT;
       BEGIN
         FOR r IN
           SELECT schemaname, tablename
             FROM pg_policies
            WHERE policyname = policy_name
              AND schemaname = 'public'
         LOOP
           EXECUTE format('DROP POLICY %I ON %I.%I', policy_name, r.schemaname, r.tablename);
           IF r.tablename = 'organizations' THEN
             org_col := 'id';
           ELSE
             org_col := 'organizationId';
           END IF;
           EXECUTE format(
             'CREATE POLICY %I ON %I.%I USING (current_setting(''app.current_org_id'', true) = ''*'' OR %I::text = current_setting(''app.current_org_id'', true))',
             policy_name, r.schemaname, r.tablename, org_col
           );
         END LOOP;
       END $$`,
    ];
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        results.push({ stmt: stmt.slice(0, 90), ok: true });
      } catch (err) {
        results.push({
          stmt: stmt.slice(0, 90),
          ok: false,
          error: err instanceof Error ? err.message.slice(0, 200) : 'Unknown',
        });
      }
    }
    return { applied: results.filter((r) => r.ok).length, total: results.length, results };
  });

  // -------------------------------------------------------------------------
  // GET /v1/admin/db-info — diagnostic — verify which DB Vercel is connecting
  // to + which columns memberships has.
  // Protected by ADMIN_SECRET bearer token.
  // -------------------------------------------------------------------------
  app.get('/db-info', async (req, reply) => {
    if (!checkAdminSecret(req, reply)) return;
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          db: string;
          host: string;
          user: string;
          schema: string;
        }>
      >(
        `SELECT current_database()::text AS db,
                inet_server_addr()::text AS host,
                current_user::text AS user,
                current_schema()::text AS schema`,
      );
      const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name::text FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'memberships'
          ORDER BY ordinal_position`,
      );
      // auth.users may not be visible to prisma_migration role — swallow error
      let authUsersCount: number | null = null;
      try {
        const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT COUNT(*)::bigint AS n FROM auth.users`,
        );
        authUsersCount = Number(r[0]?.n ?? 0);
      } catch { /* permission denied or schema missing */ }
      const orgsSample = await prisma.$queryRawUnsafe<
        Array<{ id: string; name: string }>
      >(`SELECT id::text, name FROM organizations ORDER BY "createdAt" LIMIT 3`);
      // Parse DATABASE_URL hostname (safe to expose — no password)
      let dbHostname: string | null = null;
      let dbProjectRef: string | null = null;
      try {
        const url = new URL(env.DATABASE_URL.replace(/^postgres(ql)?:/, 'http:'));
        dbHostname = url.hostname;
        // Supabase pooler URL embeds project ref in username: postgres.{ref}@...
        if (url.username && url.username.includes('.')) {
          dbProjectRef = url.username.split('.').pop() ?? null;
        }
      } catch { /* malformed url */ }
      const orgCols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name::text FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'organizations'
          ORDER BY ordinal_position`,
      );
      return {
        connection: rows[0],
        databaseUrl: { hostname: dbHostname, projectRef: dbProjectRef },
        membershipColumns: cols.map((c) => c.column_name),
        organizationColumns: orgCols.map((c) => c.column_name),
        authUsersCount,
        orgs: orgsSample,
      };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Unknown',
      };
    }
  });

  // -------------------------------------------------------------------------
  // POST /v1/admin/sign-in-as — issue a Supabase session for any user via service role.
  // Body: { email }
  // Returns: { access_token, refresh_token, user } — caller stores in localStorage
  // -------------------------------------------------------------------------
  const SignInAsBody = z.object({ email: z.string().email() });

  app.post(
    '/sign-in-as',
    { preHandler: auth, schema: { body: SignInAsBody } },
    async (req, reply) => {
      if (!ensureAdmin(req, reply)) return;
      const { email } = req.body as z.infer<typeof SignInAsBody>;
      const srk = env.SUPABASE_SERVICE_ROLE_KEY;
      const sbu = env.SUPABASE_URL;
      if (!srk || !sbu) {
        return reply.code(501).send({
          code: 'NOT_CONFIGURED',
          message: 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL not set',
        });
      }
      const sbh = {
        'Content-Type': 'application/json',
        apikey: srk,
        Authorization: `Bearer ${srk}`,
      };
      try {
        // generateLink with type=magiclink returns an action_link + the underlying tokens
        const res = await fetch(`${sbu}/auth/v1/admin/generate_link`, {
          method: 'POST',
          headers: sbh,
          body: JSON.stringify({ type: 'magiclink', email }),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return reply.code(res.status).send({
            code: 'GEN_LINK_FAILED',
            message:
              (data['msg'] || data['error_description'] || data['error']) ??
              'Unknown',
          });
        }
        // Try verifyOtp using token_hash from generated link
        const props = (data['properties'] as Record<string, unknown>) || {};
        const tokenHash = props['hashed_token'] as string | undefined;
        if (!tokenHash) {
          return reply.code(500).send({
            code: 'NO_TOKEN_HASH',
            message: 'Supabase did not return hashed_token',
          });
        }
        const verifyRes = await fetch(`${sbu}/auth/v1/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: srk },
          body: JSON.stringify({
            type: 'magiclink',
            token: tokenHash,
            email,
          }),
        });
        const verifyData = (await verifyRes.json()) as Record<string, unknown>;
        if (!verifyRes.ok || !verifyData['access_token']) {
          return reply.code(verifyRes.status || 500).send({
            code: 'VERIFY_FAILED',
            message:
              (verifyData['msg'] ||
                verifyData['error_description'] ||
                verifyData['error']) ??
              'Verify did not return access token',
          });
        }
        return reply.send({
          access_token: verifyData['access_token'],
          refresh_token: verifyData['refresh_token'],
          expires_in: verifyData['expires_in'],
          expires_at:
            Math.floor(Date.now() / 1000) +
            (Number(verifyData['expires_in']) || 3600),
          token_type: verifyData['token_type'] || 'bearer',
          user: verifyData['user'],
        });
      } catch (err) {
        return reply.code(500).send({
          code: 'SIGN_IN_AS_FAILED',
          message: err instanceof Error ? err.message : 'Unknown',
        });
      }
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
        // If user exists — scan paginated list to find by email, then update
        if (createRes.status === 422) {
          let existing: Record<string, unknown> | undefined;
          for (let page = 1; page <= 20 && !existing; page++) {
            const listRes = await fetch(
              `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
              { headers: supabaseHeaders },
            );
            const listData = (await listRes.json()) as Record<string, unknown>;
            const users = (listData['users'] as Array<Record<string, unknown>>) || [];
            existing = users.find(
              (u) =>
                ((u['email'] as string) || '').toLowerCase() ===
                body.email.toLowerCase(),
            );
            if (users.length < 200) break;
          }
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
