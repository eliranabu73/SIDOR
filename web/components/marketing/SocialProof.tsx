"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useCountUp } from "@/lib/useCountUp";
import { Skeleton } from "@/components/ui/skeleton";

function MetricCard({
  label,
  value,
  suffix = "",
  index,
  started,
}: {
  label: string;
  value: number;
  suffix?: string;
  index: number;
  started: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // Hold count at 0 until "started" flips on (after the viewport reveal kicks in).
  const count = useCountUp(0, started ? value : 0, 1800);

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : index * 0.1 }}
      className="bg-white border border-[#E2E8F0] rounded-2xl p-6 text-center transition-all duration-300 hover:-translate-y-0.5 shadow-sm"
    >
      {started ? (
        <div className="text-4xl font-bold bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent tabular-nums">
          +{count}{suffix}
        </div>
      ) : (
        <Skeleton className="mx-auto h-10 w-20" />
      )}
      <div className="mt-2 text-sm text-[#64748B]">{label}</div>
    </motion.div>
  );
}

export function SocialProof() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // Tiny delay so skeleton is briefly visible before counters spin up.
    const t = setTimeout(() => setStarted(true), 250);
    return () => clearTimeout(t);
  }, []);

  const metrics = [
    { value: 200, label: "משמרות שובצו השבוע" },
    { value: 8, label: "שעות חיסכון בשבוע", suffix: "h" },
    { value: 97, label: "עמידה בחוקי עבודה", suffix: "%" },
    { value: 14, label: "ימי ניסיון חינמי" },
  ];

  return (
    <section className="py-20 px-4 bg-[#F8FAFC] border-y border-[#E2E8F0]">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-center text-2xl font-bold text-[#0F172A] mb-12">מספרים שמדברים</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map((m, i) => (
            <MetricCard
              key={m.label}
              value={m.value}
              label={m.label}
              suffix={m.suffix}
              index={i}
              started={started}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
