# sidor4S — Roadmap

Distilled from the multi-AI strategy session (Claude + ChatGPT + Gemini, 2026-05-21).

## Where we are

- Backend: 24 Prisma models, 8-rule constraint validator, transactional `PATCH /v1/shifts/:id/assignments` with optimistic locking + Redis soft locks + audit + domain events. Open shifts + swaps APIs. WebSocket + presence. Heavy-rules worker. Supabase JWT auth. Auto-scheduler v0 (Greedy + Scoring + Candidate generation, all bulk-fetch / no N+1). 111/112 unit + integration tests green.
- Frontend: Next.js 16 (App Router) + Tailwind v4 + dnd-kit + react-query + Heebo + RTL. Schedule board (drag&drop), employees screen, auto-schedule preview dialog. Dark-first design system (co-authored with ChatGPT) — `globals.css` carries all `--color-shift-*` and density tokens. ShiftCard supports `density` prop (compact / standard / dense) + lock state + open-shift state.
- Live: `https://sidor-eta.vercel.app` (REST + static landing).
- Auth: Bearer Supabase JWT (HS256/RS256 pinned). Dev escape hatch behind `NODE_ENV=development AND AUTH_DISABLED=true`.

## The Gap (Gemini research, 2026-05-21)

| Competitor | Killer feature | Weakness |
|---|---|---|
| Connecteam | All-in-One (chat, clock, training, scheduling) | Heavy; weak auto-scheduling |
| Sling (Toast) | Free tier + deep POS integration | US-focused; no Israeli labor law |
| Deputy | Sales forecasting + auto-scheduling by demand | No real Israeli localization |
| When I Work | Strong open-shift market + self-service swaps | No Israeli localization |
| Synel / Mevaker / חילן / לביא | Perfect payroll sync + hardcore IL labor law | 1990s UX; awful mobile |

**The opening**: Modern UX (Stripe / Linear level) + smart auto-scheduling + hardcore Israeli labor-law enforcement + **WhatsApp distribution** (Israeli workers don't want yet another app).

## Roadmap

### v0.1 — MVP shipped (DONE)
Backend + frontend + auto-scheduler v0 + design system. Vercel REST live.

### v0.2 — Compliance backbone (next)

**Schema additions** (new migration `006_il_compliance`):
- `Employee.dateOfBirth: Date?` — drives the youth rule
- `Employee.pregnancyStatus: PregnancyStatus enum` (`NONE` | `DECLARED` | `WAIVED_RESTRICTIONS`)
- `Employee.pregnancyDeclaredAt: DateTime?`
- `Employee.religiousProfile: ReligiousProfile?` (`JEWISH` | `MUSLIM` | `CHRISTIAN` | `OTHER` | `UNSPECIFIED`) — drives Sabbath alignment
- `Location.hasSabbathPermit: Boolean @default(false)` — היתר העסקה בשבת
- `Organization.laborRulesProfile: enum?` (`HOSPITALITY` | `RETAIL` | `MANUFACTURING` | `NONE`) — preset overrides

**RLS policies** (Supabase):
- `Employee.pregnancyStatus` + `pregnancyDeclaredAt` visible to: the employee herself, AND managers in the same org.
- Hidden from: peers querying for shift-swap candidates. Filter at column level via Supabase RLS.

**Israeli labor-law Fast Rules** (in `src/modules/rules/rules/`):
- `youth-strict` — under-18 (computed from `dateOfBirth`): max 8h/day, 40h/week, no work between 20:00-08:00, 14h min rest. **No override** (strict blocking).
- `pregnancy-protection` — when `pregnancyStatus === 'DECLARED'`: no night, no overtime, no weekly-rest work. Blocking modal cites חוק עבודת נשים. When `WAIVED_RESTRICTIONS`: downgrade to warning (medical waiver on file).
- `weekly-rest-36h` — **fixed week** Sun 00:00 → Sat 23:59 (NOT rolling). At least one gap ≥36h. For Jewish employees: the 36h block must include Friday evening through Saturday evening UNLESS `Location.hasSabbathPermit === true`. For other religious profiles: must include their day of rest (Fri / Sat / Sun configurable).
- `night-week-streak` — max 1 night-shift week per 3-week rolling window. Blocking modal.
- `weekly-hours-overtime` — progressive: 40h orange warning, 42h+ red blocking. Triggers `<WeeklyHoursBar>` color change.
- `daily-rest-8h` — already exists. Stays as warning + acknowledge.

**UI badges** (new components):
- `<MoonBadge>` — auto on shifts with 2+ hours between 22:00-06:00
- `<WeeklyHoursBar>` — progress bar next to employee name (40→orange, 42→red)
- `<YouthBadge>` — visible "נוער" tag on employee card
- `<PregnancyShield>` — manager-only visibility (privacy via RLS). Employee sees own status in her settings.
- `<RestTimer>` — 36h countdown when shifting near weekly-rest boundary
- `<SabbathBadge>` — appears on shifts that cross/touch the Sabbath window when location lacks permit

### v0.3 — Distribution: WhatsApp
The single biggest moat. Israeli shift workers won't install a new app.
- WhatsApp Business API integration (Twilio / Vonage / Meta Cloud API).
- Outbound: published schedule → personal weekly summary message.
- Inbound: bot accepts `swap`, `availability`, `claim open shift` commands.
- Acks via interactive WhatsApp buttons.
- Owns the entire employee-side UX without an app install.

### v0.4 — Payroll export
Manager pain-point per Gemini. Single-click export to:
- `מכפל`, `חשבשבת`, `עוקץ` (Israeli accounting software)
- Format: rows = hours by type (regular / overtime / night / שבת), per employee per pay period.
- Validate against `RuleViolation` history so accountant doesn't recompute classifications.

### v0.5 — Mobile responsive board
Currently `min-w-[1100px]` — desktop only. Manager use case: check schedule from phone in evening.
- Pivot to vertical "agenda" view on `<768px`.
- Sticky day headers + condensed shift rows.
- Tap-to-claim-open-shift flow (no drag on mobile).

### v0.6 — OR-Tools backend
Replace Greedy with proper Constraint Programming (Python sidecar). Wire behind the existing `SchedulerProvider` interface — no API change.

## Pricing strategy (Gemini benchmark)

| Tier | Per-employee/month | Per-business/month (flat <10 employees) | Includes |
|---|---|---|---|
| Free | 0 | 0 | View-only published schedule, 1 manager, 5 employees |
| Basic | 12 ₪ | 99 ₪ | Manual scheduling, clock, 1 location |
| Pro | 22 ₪ | 199 ₪ | + auto-scheduler, IL labor-law enforcement, reports, swap-market |
| Premium | 35 ₪ | 499 ₪ | + WhatsApp integration, payroll export, multi-location, API |

**Premium justification** (per Gemini): saves manager ~4h/week via auto-scheduler + cuts payroll errors via export = real money. WhatsApp delivery = zero employee onboarding friction = the real moat.

## What stays untouched

- Dark-first design system. No light mode in v1.
- Card-background-never-changes rule. Only border / accent strip / drag overlay.
- Bearer JWT auth. No BFF / cookies migration until concrete XSS evidence.
- Greedy scheduler. Don't ship OR-Tools until v0.6 — premature complexity.
