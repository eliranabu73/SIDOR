import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const sqlPath = path.resolve(
  process.cwd(),
  'prisma/migrations/20260522094556_multitenant_memberships/auth_hook.sql',
);
const sql = fs.readFileSync(sqlPath, 'utf8');

const p = new PrismaClient();

/** Split SQL on ';' that is NOT inside a $$...$$ dollar-quoted block. */
function splitTopLevel(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inDollar = false;
  for (let i = 0; i < sql.length; i++) {
    const c2 = sql.slice(i, i + 2);
    if (c2 === '$$') {
      inDollar = !inDollar;
      buf += '$$';
      i++;
      continue;
    }
    const ch = sql[i];
    if (ch === ';' && !inDollar) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = '';
    } else {
      buf += ch;
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function main() {
  const cleaned = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  const stmts = splitTopLevel(cleaned);
  for (const s of stmts) {
    const stmt = s + ';';
    try {
      await p.$executeRawUnsafe(stmt);
      console.log('OK :', stmt.slice(0, 100).replace(/\s+/g, ' '));
    } catch (e) {
      console.log(
        'ERR:',
        stmt.slice(0, 100).replace(/\s+/g, ' '),
        '|',
        (e as Error).message,
      );
    }
  }
}

main()
  .then(() => p.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await p.$disconnect();
    process.exit(1);
  });
