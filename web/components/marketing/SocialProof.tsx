"use client";

import { useCountUp } from "@/lib/useCountUp";

type Metric = {
  to: number;
  prefix?: string;
  suffix?: string;
  label: string;
};

const METRICS: Metric[] = [
  { to: 200, prefix: "+", suffix: "", label: "משמרות בשבוע ממוצע" },
  { to: 8, suffix: " שעות", label: "חיסכון למנהל / שבוע" },
  { to: 0, suffix: "", label: "כפילויות ושיבוצים שגויים" },
  { to: 100, suffix: "%", label: "תאימות לחוק העבודה" },
];

export function SocialProof() {
  return (
    <section className="mesh-bg border-b border-border">
      <div className="mx-auto max-w-6xl px-6 py-20 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          מסעדות, רשתות וקמעונאות סומכות עלינו
        </p>
        <h2 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">
          המספרים שמאחורי הסידור
        </h2>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {METRICS.map((m) => (
            <MetricCard key={m.label} {...m} />
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          לוגואים של לקוחות יתווספו בקרוב — אתם עדיין יכולים להיות מהראשונים.
        </p>
      </div>
    </section>
  );
}

function MetricCard({ to, prefix, suffix, label }: Metric) {
  const { value, ref } = useCountUp(to);
  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className="glass-card rounded-2xl px-4 py-6"
    >
      <div className="text-3xl font-extrabold tabular-nums sm:text-4xl">
        <span className="text-gradient-brand">
          {prefix}
          {value}
          {suffix}
        </span>
      </div>
      <div className="mt-2 text-xs text-muted-foreground sm:text-sm">
        {label}
      </div>
    </div>
  );
}
