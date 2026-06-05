import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const orgs = await p.$queryRawUnsafe<any[]>(
    `SELECT id, name, "createdAt" FROM organizations ORDER BY "createdAt" DESC LIMIT 6`,
  );
  const wt = await p.$queryRawUnsafe<any[]>(
    `SELECT to_regclass('public.weekly_templates')::text AS exists`,
  );
  console.log('DB url host:', (process.env.DATABASE_URL || '').replace(/:[^:@]*@/, ':***@').slice(0, 80));
  console.log('weekly_templates exists here:', wt[0]?.exists);
  console.log('recent orgs:', JSON.stringify(orgs, null, 1));
  await p.$disconnect();
})().catch(async (e) => { console.error('ERR', e?.message || e); await p.$disconnect(); process.exit(1); });
