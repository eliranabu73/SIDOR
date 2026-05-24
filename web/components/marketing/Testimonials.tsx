"use client";

import { Star } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "חסכתי 5 שעות בכל שבוע. הצוות מקבל את הסידור בוואטסאפ ואני שקטה שאין חריגות חוק.",
    name: "דנה כהן",
    role: "מנהלת מסעדה, חיפה",
  },
  {
    quote:
      "בלי אקסל, בלי בלגן. תוך 3 דקות יש לי סידור לכל הסניפים.",
    name: "איתי מזרחי",
    role: "בעל רשת חנויות סלולר",
  },
  {
    quote:
      "החוקים של חוק העזרה לנוער כתובים ידנית — סוף סוף משהו שמבין את ישראל.",
    name: "נועה אברהם",
    role: "מנהלת צהרון",
  },
];

const AVATAR_COLORS = [
  { bg: "#EDE9FE", text: "#7C3AED" },
  { bg: "#DBEAFE", text: "#2563EB" },
  { bg: "#DCFCE7", text: "#16A34A" },
];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p.charAt(0)).join("");
}

export function Testimonials() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      id="testimonials"
      className="py-20 px-4 bg-[#F8FAFC] border-b border-[#E2E8F0]"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-[#0F172A] sm:text-4xl">
            עסקים אמיתיים, חיסכון אמיתי
          </h2>
          <p className="mt-3 text-[#64748B]">
            פיילוט פתוח — הציטוטים מ-design partners.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, index) => {
            const palette = AVATAR_COLORS[index % AVATAR_COLORS.length];
            return (
              <motion.div
                key={t.name}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
                whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)]"
              >
                <div
                  className="flex items-center gap-1 text-amber-400"
                  aria-label="5 כוכבים מתוך 5"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="h-4 w-4 fill-current"
                      aria-hidden
                    />
                  ))}
                </div>

                <blockquote className="mt-4 text-base leading-relaxed text-[#0F172A]">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>

                <div className="mt-4 flex items-center gap-3 border-t border-[#E2E8F0] pt-4">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: palette.bg, color: palette.text }}
                    aria-hidden
                  >
                    {getInitials(t.name)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">
                      {t.name}
                    </p>
                    <p className="text-xs text-[#64748B]">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
