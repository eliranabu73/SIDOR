"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CalendarCheck, ShieldCheck, Zap, Code2, Users } from "lucide-react";

/* ---------------------------------------------------------------
 * Decorative schedule-rows pattern for the hero bento card.
 * Pure CSS — zero extra deps.
 * --------------------------------------------------------------- */
function ScheduleRows() {
  const rows = [
    { fill: 0.75, label: "ישי כ׳" },
    { fill: 0.55, label: "מיה ל׳" },
    { fill: 0.85, label: "דן א׳" },
  ];
  return (
    <div className="mt-4 flex flex-col gap-1.5 opacity-30 select-none" aria-hidden>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-[11px] text-white/70 w-8 shrink-0">{r.label}</span>
          <div className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white/70"
              style={{ width: `${r.fill * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const features = [
  {
    icon: Zap,
    title: "שיבוץ אוטומטי",
    description:
      "AI ממלא את סידור המשמרות תוך שניות — מכסה כל דרישת כוח אדם תוך שמירה על כל כללי העסק שלך.",
    badge: "חדש",
    wide: true,
    gradient: true,
  },
  {
    icon: ShieldCheck,
    title: "תאימות לחוק",
    description: "מנוחה שבועית, שעות מקסימום, ערבי חג ומילואים — מובנים.",
    wide: false,
    gradient: false,
  },
  {
    icon: Users,
    title: "ניהול עובדים",
    description: "תפקידים, זמינות, ועדיפויות — הכל במקום אחד.",
    wide: false,
    gradient: false,
  },
  {
    icon: CalendarCheck,
    title: "תבניות מוכנות",
    description: "תבניות מוכנות לפי ענף: מסעדה, קמעונאות, פארם ועוד — התחל תוך דקה.",
    wide: false,
    gradient: false,
  },
  {
    icon: Code2,
    title: "API-first",
    description: "אינטגרציה קלה עם כל מערכת HR קיימת.",
    wide: false,
    gradient: false,
  },
];

export function Features() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="py-20 px-4 max-w-6xl mx-auto">
      {/* Section heading */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-[#0F172A]">הכל במקום אחד</h2>
        <p className="mt-3 text-[#64748B] text-base max-w-xl mx-auto">
          כל מה שמנהל זקוק לו כדי לבנות סידור עבודה מקצועי — ללא טבלאות אקסל ועם אפס כפילויות.
        </p>
      </div>

      <div className="bento-grid">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : i * 0.1 }}
              className={[
                "group rounded-3xl p-8 border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg overflow-hidden relative",
                f.wide ? "bento-wide" : "",
                f.gradient
                  ? "bg-gradient-to-br from-[#6366F1] to-[#22D3EE] text-white border-transparent shadow-[0_8px_32px_rgb(99_102_241/0.30)]"
                  : "bg-white border-[#E2E8F0] hover:border-[#6366F1]/40 hover:shadow-[0_4px_24px_rgb(99_102_241/0.12)]",
              ].join(" ")}
            >
              {/* Gradient hero card decorative blob */}
              {f.gradient && (
                <div
                  aria-hidden
                  className="absolute -top-12 -end-12 w-48 h-48 rounded-full bg-white/10 blur-2xl pointer-events-none"
                />
              )}

              {/* Icon */}
              <div
                className={`inline-flex p-2.5 rounded-xl mb-4 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 ${
                  f.gradient ? "bg-white/20" : "bg-[#6366F1]/10 group-hover:bg-[#6366F1]/15"
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${f.gradient ? "text-white" : "text-[#6366F1]"}`}
                />
              </div>

              {/* Title + optional badge */}
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-lg">{f.title}</h3>
                {f.badge && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/25 text-white">
                    {f.badge}
                  </span>
                )}
              </div>

              {/* Description */}
              <p
                className={`text-sm leading-relaxed ${
                  f.gradient ? "text-white/80" : "text-[#64748B]"
                }`}
              >
                {f.description}
              </p>

              {/* Decorative schedule rows on hero card */}
              {f.gradient && <ScheduleRows />}

              {/* Subtle bottom accent line on plain cards */}
              {!f.gradient && (
                <div
                  aria-hidden
                  className="absolute bottom-0 start-8 end-8 h-[2px] rounded-full bg-gradient-to-r from-[#6366F1]/0 via-[#6366F1]/40 to-[#6366F1]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                />
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
