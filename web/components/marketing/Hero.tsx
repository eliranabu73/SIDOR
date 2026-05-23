import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mini schedule preview — realistic-looking shift board
function SchedulePreview() {
  const days = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳"];
  const employees = [
    { name: "ישי כ׳", shifts: [1, 1, 0, 1, 0] },
    { name: "מיה ל׳", shifts: [0, 1, 1, 1, 0] },
    { name: "דן א׳", shifts: [1, 0, 1, 0, 1] },
    { name: "רותם פ׳", shifts: [0, 1, 0, 1, 1] },
  ];

  return (
    <div className="glass-card rounded-2xl p-5 shadow-2xl w-80 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-foreground/80">סידור שבועי — שבוע 22</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-500">
          <Sparkles className="h-2.5 w-2.5" aria-hidden />
          AI שיבץ
        </span>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(5,1fr)] gap-1 mb-1">
        <div />
        {days.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground">{d}</div>
        ))}
      </div>

      {/* Employee rows */}
      <div className="flex flex-col gap-1">
        {employees.map((emp, i) => (
          <div key={i} className="grid grid-cols-[60px_repeat(5,1fr)] gap-1 items-center">
            <span className="text-[11px] text-muted-foreground truncate text-end pe-2">{emp.name}</span>
            {emp.shifts.map((on, j) => (
              <div
                key={j}
                className={`h-7 rounded-md ${
                  on
                    ? i % 2 === 0
                      ? "bg-gradient-to-br from-[#6366F1] to-[#818CF8] opacity-90"
                      : "bg-gradient-to-br from-[#06B6D4] to-[#22D3EE] opacity-80"
                    : "bg-muted/50"
                }`}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Footer stats */}
      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
          <CheckCircle2 className="h-3 w-3" />
          12 משמרות
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-amber-500 font-medium">
          <AlertCircle className="h-3 w-3" />
          1 אזהרה
        </span>
        <span className="text-[10px] text-muted-foreground">100% עמידה</span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mesh-bg relative overflow-hidden min-h-[85vh] flex items-center border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-24 lg:py-32 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">

          {/* Copy column — first in DOM = inline-start (right in RTL) */}
          <div className="flex-1 text-center lg:text-start">

            {/* Badge */}
            <span className="inline-flex items-center gap-2 rounded-full glass-card px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" aria-hidden />
              בטא פתוחה · חינם לזמן מוגבל
            </span>

            {/* Headline */}
            <h1 className="mt-6 text-4xl font-bold leading-tight text-foreground sm:text-5xl md:text-6xl">
              סידורי עבודה{" "}
              <span className="text-gradient-brand">חכמים</span>
              <br />
              לעסק שלך
            </h1>

            {/* Sub */}
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl lg:mx-0">
              סידור4S חוסך למנהלים ישראלים כ-4 שעות בשבוע עם שיבוץ אוטומטי
              שמקפיד על חוקי העבודה — שעות נוספות, מנוחה שבועית, ערבי חג ומילואים.
            </p>

            {/* CTAs */}
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

            {/* Trust row */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:justify-start">
              {[
                "שעות נוספות אוטומטי",
                "מנוחה שבועית",
                "מילואים",
              ].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Preview card — second in DOM = inline-end (left in RTL), desktop only */}
          <div className="hidden lg:block shrink-0" aria-hidden>
            <SchedulePreview />
          </div>

        </div>
      </div>
    </section>
  );
}
