"use client";

import { useCountUp } from "@/lib/useCountUp";

function MetricCard({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  const count = useCountUp(0, value, 1800);
  return (
    <div className="glass-card rounded-2xl p-6 text-center transition-all duration-300 hover:-translate-y-0.5">
      <div className="text-4xl font-bold bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent tabular-nums">
        +{count}{suffix}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export function SocialProof() {
  return (
    <section className="mesh-bg py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-center text-2xl font-bold mb-12">מספרים שמדברים</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard value={200} label="משמרות בשבוע" />
          <MetricCard value={8} label="שעות חיסכון בשבוע" suffix="h" />
          <MetricCard value={0} label="כפילויות בשיבוץ" />
          <MetricCard value={100} label="תאימות לחוק" suffix="%" />
        </div>
      </div>
    </section>
  );
}
