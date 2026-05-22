import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, hsl(215 90% 30% / 0.25) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          בטא פתוחה · חינם לזמן מוגבל
        </span>
        <h1 className="mt-6 text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
          סידורי עבודה חכמים לעסק שלך
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          סידור4S חוסך למנהלים ישראלים כ-4 שעות בשבוע עם שיבוץ אוטומטי
          שמקפיד על חוקי העבודה בישראל — שעות נוספות, מנוחה שבועית, ערבי
          חג ומילואים.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="min-w-44">
            <Link href="/login">התחל חינם</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-w-44">
            <Link href="/schedule">ראה דמו</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          ללא כרטיס אשראי · התקנה ב-2 דקות
        </p>
      </div>
    </section>
  );
}
