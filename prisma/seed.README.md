# Demo data seed

Populates the Supabase Postgres with a realistic demo organization
("מסעדת אלירן"), one location, six roles, eight employees, weekly
availability rules, a current-week schedule with 28 shifts, and a
handful of assignments + open shifts.

## Run

From the repo root:

```bash
npx tsx prisma/seed.ts
# or, equivalently:
npx prisma db seed
```

The script uses the `DATABASE_URL` already configured in `.env`. Make
sure that points at the environment you intend to seed (the script
writes real rows — don't run it against prod without thinking).

## Idempotency

Every row is `upsert`'d by a deterministic UUID, so the script is safe
to re-run. The schedule is **week-relative**: the IDs stay the same,
but `periodStartDate` / `periodEndDate` move to the current ISO-Sunday
week each time you run it.

## After seeding

Seeded data only appears in the live frontend after:

1. Setting `NEXT_PUBLIC_USE_MOCKS=false` in Vercel project env.
2. Redeploying the `web/` app.

Demo org UUID: `10000000-0000-0000-0000-000000000001`

Direct link (once mocks are off):
<https://sidor-eta.vercel.app/schedule?org=10000000-0000-0000-0000-000000000001>
