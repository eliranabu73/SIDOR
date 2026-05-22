import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="mesh-bg mesh-bg-animated overflow-hidden border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:py-32">
        {/* Copy column */}
        <div className="text-center lg:text-start">
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
            <Button asChild size="lg" variant="outline" className="min-w-44">
              <Link href="/schedule">ראה דמו חי</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            ללא כרטיס אשראי · התקנה ב-2 דקות
          </p>
        </div>

        {/* Floating preview card — desktop only */}
        <div className="hidden lg:block" aria-hidden>
          <PreviewBoard />
        </div>
      </div>
    </section>
  );
}

function PreviewBoard() {
  const days = ["א", "ב", "ג", "ד", "ה"];
  const cells: Array<"ok" | "warn" | "empty" | "shimmer" | "open"> = [
    "ok", "ok", "warn", "empty", "open",
    "ok", "ok", "ok", "shimmer", "ok",
    "warn", "ok", "ok", "ok", "empty",
  ];
  return (
    <div className="relative">
      <div
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-indigo-500/30 via-cyan-400/20 to-pink-400/20 blur-2xl"
        aria-hidden
      />
      <div className="glass-card rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">שבוע 19</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            חי
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
          {days.map((d) => (
            <div key={d} className="py-1 text-muted-foreground">{d}</div>
          ))}
          {cells.map((kind, i) => (
            <div
              key={i}
              className={`h-12 rounded-md border ${cellClass(kind)}`}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> משובץ
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> אזהרה
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> פתוח
          </span>
        </div>
      </div>
    </div>
  );
}

function cellClass(kind: "ok" | "warn" | "empty" | "shimmer" | "open"): string {
  switch (kind) {
    case "ok":      return "border-emerald-500/60 bg-emerald-500/10";
    case "warn":    return "border-amber-500/60 bg-amber-500/10";
    case "open":    return "border-sky-500/60 bg-sky-500/10";
    case "shimmer": return "skeleton border-transparent";
    default:        return "border-dashed border-border bg-transparent";
  }
}
