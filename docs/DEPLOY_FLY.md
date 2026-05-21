# פריסת ה-Backend ל-Fly.io

מדריך קצר ומדויק לפריסת ה-Fastify API של sidor4S ל-Fly.io.
ה-Frontend נשאר ב-Vercel; רק ה-API עובר ל-Fly.

האזור שנבחר: `fra` (Frankfurt) — הכי קרוב לישראל.
שם האפליקציה ברירת מחדל: `sidor-api` (אפשר לשנות ב-`fly.toml`).

---

## 1. התקנת flyctl (Windows PowerShell)

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

לאחר ההתקנה תצטרך לפתוח טרמינל חדש כדי ש-`fly` יוכר.
בדיקה:

```powershell
fly version
```

## 2. התחברות

```powershell
fly auth login
```

ייפתח דפדפן. אם אין לך חשבון תרשם (יש Hobby plan חינמי עם כרטיס אשראי לאימות).

## 3. אתחול האפליקציה ב-Fly (בלי deploy)

מהשורש של הריפו:

```powershell
fly launch --no-deploy --copy-config --name sidor-api --region fra
```

- `--copy-config` אומר ל-flyctl להשתמש ב-`fly.toml` הקיים שלנו.
- אם הוא שואל על Postgres/Redis/Tigris — ענה **No** לכולם (אנחנו משתמשים ב-Supabase ולא צריכים Redis לסטארט).
- אם שם האפליקציה תפוס תקבל הודעה — שנה ל-`sidor-api-<משהו ייחודי>` גם ב-`fly.toml` וגם בפקודה.

## 4. הגדרת Secrets

הרץ את כל הפקודות הבאות (אחת-אחת, או בלוק אחד). החלף את `SUPABASE_JWT_SECRET` ב-JWT secret מ-Supabase Dashboard → Project Settings → API → "JWT Secret".

```powershell
fly secrets set `
  DATABASE_URL="postgresql://postgres.lpnqyzlfsosdxnykaaer:[YOUR-DB-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1" `
  DIRECT_URL="postgresql://postgres.lpnqyzlfsosdxnykaaer:[YOUR-DB-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres" `
  SUPABASE_URL="https://lpnqyzlfsosdxnykaaer.supabase.co" `
  SUPABASE_ANON_KEY="sb_publishable_n3OjpV8Bm8ydDO3HvqraWw_7bFJlCDR" `
  SUPABASE_JWT_SECRET="TODO_get_from_supabase_dashboard" `
  JWT_SECRET="$(([guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()))" `
  --app sidor-api
```

הערות:
- `DATABASE_URL` / `DIRECT_URL` — קח את הערכים המדויקים מקובץ ה-`.env` המקומי שלך. הסיסמה (`[YOUR-DB-PASSWORD]`) חייבת להיות הסיסמה האמיתית מ-Supabase Dashboard → Database.
- `SUPABASE_JWT_SECRET` — חובה למלא, אחרת אימות לא יעבוד. נמצא ב-Supabase: Project Settings → API → JWT Settings → JWT Secret.
- `JWT_SECRET` — הפקודה למעלה מייצרת אוטומטית מחרוזת אקראית.
- `REDIS_URL` — אופציונלי, דלג עליו לעת עתה. אפשר להוסיף מאוחר יותר עם `fly secrets set REDIS_URL="..."`.

לבדיקת ה-secrets שהוגדרו:

```powershell
fly secrets list --app sidor-api
```

## 5. פריסה

```powershell
fly deploy --app sidor-api
```

הבנייה תרוץ על שרתי Fly (multi-stage Docker build). תהליך ראשון לוקח 3-5 דקות.

## 6. אימות

```powershell
curl https://sidor-api.fly.dev/health
```

תשובה צפויה:
```json
{"status":"ok"}
```

צפייה בלוגים בזמן אמת:

```powershell
fly logs --app sidor-api
```

## 7. חיבור ה-Frontend ב-Vercel

ב-Vercel Dashboard → הפרויקט (`sidor-eta`) → Settings → Environment Variables, עדכן:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://sidor-api.fly.dev` |
| `NEXT_PUBLIC_USE_MOCKS` | `false` |

לאחר מכן Redeploy ל-Vercel (Deployments → ⋯ → Redeploy על האחרון).

---

## פקודות שימושיות בהמשך

```powershell
fly status --app sidor-api          # סטטוס מכונות
fly logs --app sidor-api            # לוגים חיים
fly ssh console --app sidor-api     # shell בתוך הקונטיינר
fly scale memory 1024 --app sidor-api   # שדרוג זיכרון אם צריך
fly secrets set FOO=bar --app sidor-api # עדכון משתנה
fly apps destroy sidor-api          # מחיקת האפליקציה (להזהר)
```

## עלות צפויה

עם `auto_stop_machines = "stop"` ב-`fly.toml`, המכונה נכבית כשאין תעבורה.
ב-Hobby plan עם מכונת `shared-cpu-1x` / 512MB — בפועל בחינם או כמה דולרים בחודש אחרי free allowance.
