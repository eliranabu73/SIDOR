# sidor4S

Work-scheduling SaaS backend. Fastify + Prisma + Postgres (Supabase) + Redis.

## Quick start

```bash
npm install
cp .env.example .env   # fill DB password and (optionally) REDIS_URL
npm run prisma:generate
npm run prisma:migrate -- --name init
npm test
npm run dev
```

## Architecture

- **Constraint Validator** — pure-function Fast Rules, Redis-cached `RulesSnapshot`, deferred Heavy Rules.
- **Concurrency** — optimistic locking via `version` columns + 409 on mismatch; Redis TTL soft locks for live UX.
- **Domain events** — `ScheduleEvent` table + Redis pubsub on `events:{orgId}`.
- **Audit** — every mutation writes `ScheduleAuditLog` in the same transaction.

See `C:\Users\elira\.claude\plans\velvet-stirring-fog.md` for the full plan.

## Security TODO before production

- Rotate the Supabase DB password (the dev one was shared in chat).
- Enable RLS on every table once a client SDK exists.
- Replace `x-user-id` header with real Supabase Auth JWT verification.
