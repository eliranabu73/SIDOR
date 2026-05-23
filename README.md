# סידור4S — Work Scheduling SaaS

**RTL Hebrew shift-scheduling platform** for Israeli SMBs (restaurants, retail, pharmacies, kindergartens, clinics, more). Auto-scheduler with Israeli labor-law constraints, WhatsApp share, fairness analytics.

**Stack:** Next.js 16 + Tailwind v4 (frontend) · Fastify + Prisma + Postgres/Supabase + Redis (backend) · Vercel deploy.

---

## Live URLs

- **Frontend:** https://sidor-eta.vercel.app
- **Backend:** https://sidor-api.vercel.app
- **Public demo:** https://sidor-eta.vercel.app/schedule (no login needed)

---

## Features (v1.0)

### Core
- 🗓️ **Weekly schedule board** — 7-day grid, drag-drop assignments, conflict detection
- 🤖 **Auto-scheduler** — greedy + simulated-annealing optimizer (fairness ≥ 80% improvement over greedy)
- 📋 **13 industry templates** — restaurant, retail, pharmacy, kindergarten, school, homecare, events, garage, clinic, hotel, security, warehouse, other
- 👥 **Employees, roles, locations, availability** — full CRUD
- 🔄 **Swap requests** — employee-to-employee shift swaps with manager approval
- ⚖️ **Fairness analytics** — hours stddev, weekend/night balance, per-employee scores
- 💰 **Labor cost** — per-schedule and per-employee cost rollups
- 📤 **WhatsApp share** — PNG/PDF export in 3 styles (minimal/branded/dark) + per-employee personal links
- 🔔 **Realtime** — SSE updates, no-refresh schedule changes

### Auth (Supabase native)
- 🔐 Google OAuth
- 🔐 Email + password
- 🔐 Magic link
- 🎬 **Public demo mode** — `/schedule` renders mock data without login

### UI/UX
- 📱 **Mobile-first** — bottom tab bar, sheet drawers, 44px touch targets, full-screen dialogs
- 📲 **PWA installable** — add to home screen on iOS/Android, works offline (cached shell)
- 🌙 **Dark mode** — full theme toggle with no-flash inline script
- 🇮🇱 **RTL Hebrew** — Heebo font, all UI in Hebrew
- ♿ **WCAG accessible** — Lighthouse a11y ≥ 95, axe 0 critical/serious

### Israeli Labor Law Constraints (validator)
- Min 8h rest between shifts
- Max hours per day / week per employment type
- Overlap prevention
- Role match enforcement
- Weekly rest (Shabbat)
- Locked shifts (manager-protected)

---

## Quick start (local dev)

```bash
# Backend
npm install
cp .env.example .env   # fill DATABASE_URL + Supabase keys
npm run prisma:generate
npm run prisma:migrate -- --name init
npm test
npm run dev            # Fastify on :3001

# Frontend
cd web
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm run dev                  # Next on :3000
```

---

## Architecture

```
┌──────────────────┐         ┌────────────────────────┐
│  Next.js (web/)  │ ──HTTPS─▶│  Fastify (src/)        │
│  RTL Heeboo      │         │  /v1/* + auth plugin   │
│  Supabase Auth   │         │  Prisma → Postgres     │
└──────────────────┘         │  Redis (locks + pub)   │
                             └────────────────────────┘
                                       │
                            ┌──────────┴───────────┐
                            ▼                      ▼
                    ┌──────────────┐       ┌──────────────┐
                    │ Supabase DB  │       │ Upstash Redis│
                    │ (Postgres)   │       │ (locks, pub) │
                    └──────────────┘       └──────────────┘
```

### Key modules

| Module | Purpose |
|--------|---------|
| `src/modules/auth` | Supabase JWT verification (ES256), DB-fallback for first-login |
| `src/modules/onboarding` | Org + Location + Schedule + Membership creation |
| `src/modules/templates` | 13 industry templates → roles + shifts |
| `src/modules/scheduler` | Greedy + OR-Tools (SA) optimizer providers |
| `src/modules/rules` | Pure-function constraint validators (role-match, availability, overlap, min-rest, max-hours-{day,week}, shift-not-locked, employee-active) |
| `src/modules/share` | HMAC-signed tokens, per-employee deep links, PNG/PDF export |
| `src/modules/swaps` | Shift swap marketplace |
| `src/modules/fairness` | Hours stddev, weekend/night balance scoring |
| `src/modules/realtime` | SSE event streams over Redis pubsub |

### Concurrency model
- **Optimistic locking** — `version` columns + 409 Conflict on mismatch
- **Soft locks** — Redis TTL keys for live drag-drop UX
- **Domain events** — `ScheduleEvent` table + Redis pubsub `events:{orgId}`
- **Audit** — every mutation writes `ScheduleAuditLog` in the same transaction

---

## Schedule export (WhatsApp / PDF)

```
GET /v1/schedules/:id/export.png?style=branded   →  PNG (satori + @resvg/resvg-js)
GET /v1/schedules/:id/export.pdf?style=minimal   →  PDF (@react-pdf/renderer)
```

Styles: `minimal` (B&W), `branded` (indigo→cyan gradient), `dark` (slate-950).

---

## Security model

- **JWT** — All routes verify Supabase ES256 JWT via `app.authenticate` preHandler. DB fallback fills `orgId` on first login.
- **RLS** — Postgres Row Level Security enabled on 17 org-scoped tables via `app.current_org_id` setting. Migration: `prisma/migrations/20260523120000_enable_rls/`.
- **Production guard** — `AUTH_DISABLED=true` rejected at boot when `NODE_ENV=production`.
- **HMAC share tokens** — Stateless, 90-day expiry, base64url-encoded.
- **Platform admin** — Cross-tenant `/admin` dashboard gated by `PLATFORM_ADMIN_EMAILS` env (comma-separated, defaults to `eliranabu320@gmail.com`). Admin queries explicitly bypass RLS via `withAdminContext()` (issues `SET LOCAL row_security = off` inside the transaction). Distinct from per-org `OWNER` role.

---

## Platform admin (/admin)

Reserved for the SaaS owner. Lives under `/admin` in the web app and `/v1/admin/*` in the API.

- **Auth**: Bearer JWT + email allowlist (`PLATFORM_ADMIN_EMAILS`). Non-allowlisted users get 403 from the API and a client-side redirect to `/`.
- **Routes**: `/v1/admin/check`, `/stats`, `/orgs`, `/orgs/:id`, `/users`, `/audit`.
- **RLS bypass**: All admin queries run inside `withAdminContext()`, which issues `SET LOCAL row_security = off` so cross-tenant reads work.
- **UI**: dashboard with metrics cards (orgs / users / employees / shifts / signups7d / activeOrgs7d), searchable orgs table with detail drawer, users list, cross-tenant audit log.

---

## Setup checklist (production)

### Supabase Auth providers
In Supabase Dashboard → Authentication → Providers:

1. **Email** — enable with password sign-in (default on)
2. **Google OAuth**:
   - Create OAuth client at https://console.cloud.google.com/apis/credentials
   - Authorized redirect URI: `https://<project>.supabase.co/auth/v1/callback`
   - Paste client_id + secret in Supabase
3. **Site URL:** `https://sidor-eta.vercel.app`
4. **Additional redirect URLs:**
   - `https://sidor-eta.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`

### Database migrations (production)
```bash
# Run once when ready to enforce RLS:
DATABASE_URL=<prod-url> npx prisma migrate deploy
```

### Environment variables (Vercel)
Backend (`src/`):
- `DATABASE_URL` — Supabase Postgres connection string
- `SUPABASE_JWT_JWKS_URL` — `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`
- `SHARE_HMAC_SECRET` — random 32+ char secret for share tokens
- `REDIS_URL` — Upstash Redis (optional, falls back to in-memory)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase service-role key. Required for `/v1/admin/impersonate` and email enrichment in `/v1/admin/users`. Leave empty to disable those features (impersonate returns 501, emails return null).
- `NODE_ENV=production`

Frontend (`web/`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE` — e.g. `https://sidor-api.vercel.app`

---

## Testing

```bash
npm test         # 160+ tests passing across 28 suites (jest)
npm run test:cov # with coverage
```

Coverage areas: auth, rules, scheduler (greedy + or-tools), templates, settings, share (tokens + routes + export PNG/PDF), employees, onboarding.

### E2E tests (Playwright)

Frontend E2E tests live in `web/e2e/` and use Playwright + Chromium.

**Prerequisites:**
- Next.js dev server running: `cd web && npm run dev` (port 3001)
- For auth-gated pages either set `NEXT_PUBLIC_AUTH_DISABLED=true` in `web/.env.local`
  or leave Supabase env vars unset (AuthGuard falls back to ok-status)

**Run:**
```bash
cd web

# Headless (CI-friendly)
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui

# Visible browser
npm run test:e2e:headed
```

The backend apply tests inside the Playwright spec gracefully skip when the
backend isn't running on `:3001`. The pure data-contract tests run in all environments
without any server.

**Jest integration tests (backend, requires DB):**
```bash
# Without DB — only 404 path and data-contract tests run
npx jest tests/templates/apply-e2e --no-coverage

# With DB — set TEST_DATABASE_URL in .env then:
SKIP_DB_TESTS=false npx jest tests/templates/apply-e2e --no-coverage
```

---

## Out of scope (post-v1.0)

- Payments (Stripe / Paddle)
- iOS/Android native apps (PWA only)
- WhatsApp Cloud API direct send (we use `wa.me` deep links + downloadable file)
- i18n beyond Hebrew (English/Arabic deferred)
- Push notifications

---

## License

Proprietary. © 2026 Eliran Abu.
