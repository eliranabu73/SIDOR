import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="mesh-bg relative overflow-hidden min-h-[85vh] flex items-center border-b border-border">
      {/* Floating preview card — desktop only */}
      <div className="hidden lg:block absolute left-8 top-1/2 -translate-y-1/2 w-72" aria-hidden>
        <div className="glass-card rounded-2xl p-4 shadow-2xl">
          <div className="text-xs font-semibold mb-3 opacity-70">תצוגה מקדימה — לוח משמרות</div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className={`h-10 rounded-lg ${i === 4 ? "bg-gradient-to-br from-[#6366F1] to-[#22D3EE] animate-pulse" : "bg-muted"}`}
              />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-6 w-16 rounded-full bg-muted animate-pulse" />
            <div className="h-6 w-12 rounded-full bg-muted" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32 w-full">
        {/* Copy column — centered on mobile, offset right on desktop to leave room for the card */}
        <div className="text-center lg:text-start lg:ml-auto lg:max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full glass-card px-3 py-1 text-xs font-medium text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
            בטא פתוחה · חינם לזמן מוגבל
          </span>
          <h1 className="mt-6 text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
            סידורי עבודה{" "}
            <span className="text-gradient-brand">חכמים</span>
            <br />
            לעסק שלך
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl lg:mx-0">
            סידור4S חוסך למנהלים ישראלים כ-4 שעות בשבוע עם שיבוץ אוטומטי
            שמקפיד על חוקי העבודה בישראל — שעות נוספות, מנוחה שבועית, ערבי
            חג ומילואים.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Button asChild size="lg" variant="glow" className="min-w-44">
              <Link href="/login">
                התחל חינם
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="min-w-44">
              <Link href="/schedule">ראה דמו חי</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            ללא כרטיס אשראי · התקנה ב-2 דקות
          </p>
        </div>
      </div>
    </section>
  );
}
