"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, CheckCircle2, Play, Clock, Users, Shield } from "lucide-react";
import { VideoModal } from "./VideoModal";

function DashboardMockup() {
  const days = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳"];

  // Color classes for shift blocks — pastel fill style
  const C = {
    cyan:   "bg-[#BAE6FD]",
    green:  "bg-[#BBF7D0]",
    purple: "bg-[#DDD6FE]",
    orange: "bg-[#FED7AA]",
    empty:  "bg-[#F1F5F9]",
  } as const;
  type Color = keyof typeof C;

  const employees: { name: string; shifts: Color[] }[] = [
    { name: "יעל לוי",   shifts: ["purple","purple","empty","cyan","cyan"] },
    { name: "מיה כהן",   shifts: ["cyan","green","cyan","empty","empty"] },
    { name: "דן אברמי",  shifts: ["empty","purple","purple","orange","empty"] },
    { name: "רותם שחר",  shifts: ["green","orange","empty","green","green"] },
    { name: "יובל גולן", shifts: ["cyan","cyan","green","empty","orange"] },
  ];

  return (
    <div className="relative" style={{ paddingBottom: "80px" }}>
      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative bg-white rounded-[32px] p-6 w-[500px]"
        style={{
          boxShadow: "0 32px 80px rgba(15,23,42,0.12), 0 8px 24px rgba(15,23,42,0.06)",
          transform: "perspective(1200px) rotateY(-6deg) rotateX(2deg)",
          willChange: "transform",
        }}
      >
        {/* Card header row */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-[11px] text-[#94A3B8]">13 סמני גיעה</span>
          <span className="text-sm font-bold text-[#0F172A]">סידור שבועי — שבוע 22</span>
        </div>

        {/* Day headers */}
        <div className="grid mb-2" style={{ gridTemplateColumns: "108px repeat(5,1fr)", gap: "8px" }}>
          <div />
          {days.map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-[#64748B]">{d}</div>
          ))}
        </div>

        {/* Employee rows */}
        <div className="flex flex-col gap-2">
          {employees.map((emp, i) => (
            <div key={i} className="grid items-center" style={{ gridTemplateColumns: "108px repeat(5,1fr)", gap: "8px" }}>
              <span className="text-[12px] font-medium text-[#0F172A] text-end pe-3">{emp.name}</span>
              {emp.shifts.map((color, j) => (
                <div key={j} className={`h-10 rounded-xl ${C[color]}`} />
              ))}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Floating badge — top-right corner of card (start in RTL = right visually) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -top-4 -start-6 bg-gradient-to-br from-[#8B5CF6] to-[#6D28D9] rounded-2xl px-4 py-3 shadow-[0_8px_24px_rgba(109,40,217,0.35)]"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-white/90 shrink-0" />
          <div>
            <div className="text-[12px] font-bold text-white leading-none">שיבוץ אוטומטי</div>
            <div className="text-[10px] text-white/70 mt-0.5">חכם ומדויק</div>
          </div>
        </div>
      </motion.div>

      {/* Floating stat cards — bottom */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="absolute bottom-0 start-0 end-0 flex gap-3"
        style={{ paddingInline: "12px" }}
      >
        {[
          { icon: Clock,   color: "#2563EB", bg: "#DBEAFE", value: "4.2", label: "שעות נחסכו\nהשבוע" },
          { icon: Users,   color: "#10B981", bg: "#DCFCE7", value: "12",  label: "משמרות\nשובצו" },
          { icon: Shield,  color: "#8B5CF6", bg: "#EDE9FE", value: "100%",label: "עמידה בחוקי\nעבודה" },
        ].map(({ icon: Icon, color, bg, value, label }) => (
          <div
            key={value}
            className="flex-1 bg-white rounded-2xl p-3 flex items-center gap-3"
            style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.10)" }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
              <Icon className="h-4 w-4" style={{ color }} />
            </div>
            <div>
              <div className="text-lg font-black leading-none" style={{ color }}>{value}</div>
              <div className="text-[9px] text-[#94A3B8] mt-0.5 whitespace-pre-line leading-tight">{label}</div>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export function Hero() {
  const [videoOpen, setVideoOpen] = useState(false);

  const trustItems = [
    "ללא כרטיס אשראי",
    "הקמה ב-2 דקות",
    "ניסיון חינם 14 יום",
    "מותאם לחוקי עבודה",
  ];

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 75% 10%, rgba(37,99,235,0.07) 0%, transparent 60%)," +
          "radial-gradient(ellipse 60% 50% at 20% 90%, rgba(6,182,212,0.06) 0%, transparent 55%)," +
          "#F0F4FF",
      }}
    >
      {/* Subtle dotted pattern */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.4) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.5,
        }}
      />

      {/* Decorative arc lines */}
      <svg
        aria-hidden
        className="pointer-events-none absolute end-0 top-0 h-full"
        style={{ width: "55%", opacity: 0.07 }}
        viewBox="0 0 900 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path d="M 900 0 Q 450 200 700 400 Q 950 600 450 800" stroke="#2563EB" strokeWidth="2.5" />
        <path d="M 950 80 Q 550 280 750 480 Q 950 680 550 880" stroke="#06B6D4" strokeWidth="2" />
        <path d="M 800 -50 Q 350 150 600 350 Q 850 550 350 750" stroke="#8B5CF6" strokeWidth="1.5" />
      </svg>

      <div className="relative mx-auto max-w-[1400px] px-6 pt-[120px] pb-[160px]">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20">

          {/* RIGHT column — copy (first in RTL DOM = right visually) */}
          <div className="flex-1 text-center lg:text-start">

            {/* Israel badge */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2.5 bg-white border border-[#E2E8F0] rounded-full px-4 py-2 text-sm font-medium text-[#0F172A] shadow-sm"
            >
              <span className="text-base" role="img" aria-label="דגל ישראל">🇮🇱</span>
              <span>נבנה במיוחד לעסקים בישראל</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="mt-6 font-black text-[#0F172A] leading-[0.95]"
              style={{ fontSize: "clamp(2.8rem, 5vw, 4.5rem)", maxWidth: "700px" }}
            >
              סידורי עבודה{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(to left, #2563EB, #06B6D4)" }}
              >
                חכמים
              </span>
              <br />
              לעסק שלך
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mt-6 text-lg text-[#64748B] leading-relaxed"
              style={{ maxWidth: "640px" }}
            >
              סידור4S חוסך למנהלים 4–6 שעות בשבוע עם שיבוץ אוטומטי שמתחשב בזמינות עובדים,
              חוקי עבודה, העדפות ומשמרות פתוחות.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3"
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl text-white font-semibold text-base transition-all hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(to left, #2563EB, #06B6D4)",
                  boxShadow: "0 8px 24px rgba(37,99,235,0.35)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 32px rgba(37,99,235,0.45)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(37,99,235,0.35)"; }}
              >
                <span>התחל חינם</span>
                <ArrowLeft className="h-4 w-4" />
              </Link>

              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className="inline-flex items-center gap-3 h-14 px-8 rounded-2xl bg-white border border-[#E2E8F0] text-[#0F172A] font-medium text-base transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ boxShadow: "0 2px 8px rgba(15,23,42,0.06)" }}
              >
                <div className="w-7 h-7 bg-[#F1F5F9] rounded-full flex items-center justify-center">
                  <Play className="h-3.5 w-3.5 text-[#0F172A] fill-current" />
                </div>
                <span>צפה בדמו (60 שניות)</span>
              </button>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.6 }}
              className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3"
            >
              {trustItems.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
                  <span className="text-sm text-[#475569] font-medium">{item}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* LEFT column — dashboard (second in RTL DOM = left visually) */}
          <div className="hidden lg:flex shrink-0 items-center justify-center" aria-hidden>
            <DashboardMockup />
          </div>

        </div>
      </div>

      <VideoModal open={videoOpen} onOpenChange={setVideoOpen} />
    </section>
  );
}
