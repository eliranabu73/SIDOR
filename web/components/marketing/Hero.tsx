"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CheckCircle2, Play, Clock, Users, Shield, Zap } from "lucide-react";
import { VideoModal } from "./VideoModal";

const AVATAR_COLORS = [
  { bg: "#EDE9FE", text: "#7C3AED" },
  { bg: "#DBEAFE", text: "#2563EB" },
  { bg: "#DCFCE7", text: "#16A34A" },
  { bg: "#FEF3C7", text: "#D97706" },
  { bg: "#FCE7F3", text: "#DB2777" },
];

function DashboardMockup() {
  const days = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳"];

  const C = {
    cyan:   { bg: "#BAE6FD", border: "#7DD3FC" },
    green:  { bg: "#BBF7D0", border: "#86EFAC" },
    purple: { bg: "#DDD6FE", border: "#C4B5FD" },
    orange: { bg: "#FED7AA", border: "#FDBA74" },
    empty:  { bg: "#F8FAFC", border: "#E2E8F0" },
  } as const;
  type Color = keyof typeof C;

  const employees: { name: string; initial: string; shifts: Color[] }[] = [
    { name: "יעל לוי",   initial: "י", shifts: ["purple","purple","empty","cyan","cyan"] },
    { name: "מיה כהן",   initial: "מ", shifts: ["cyan","green","cyan","empty","empty"] },
    { name: "דן אברמי",  initial: "ד", shifts: ["empty","purple","purple","orange","empty"] },
    { name: "רותם שחר",  initial: "ר", shifts: ["green","orange","empty","green","green"] },
    { name: "יובל גולן", initial: "י", shifts: ["cyan","cyan","green","empty","orange"] },
  ];

  return (
    <div className="relative">
      {/* Soft glow ring behind card */}
      <div
        aria-hidden
        className="dashboard-glow absolute inset-0 rounded-[40px]"
        style={{
          background: "radial-gradient(ellipse at 60% 40%, rgba(37,99,235,0.09) 0%, transparent 70%)",
          filter: "blur(24px)",
        }}
      />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="dashboard-card relative bg-white rounded-[28px] lg:rounded-[32px] p-5 lg:p-7 w-full"
        style={{
          boxShadow:
            "0 40px 100px rgba(15,23,42,0.10), 0 12px 32px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
          border: "1px solid rgba(226,232,240,0.8)",
        }}
      >
        {/* Live header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-[#64748B]">עדכון חי</span>
          </div>
          <span className="text-[13px] font-bold text-[#0F172A] tracking-tight">
            סידור שבועי — שבוע 22
          </span>
        </div>

        {/* Day headers */}
        <div
          className="grid mb-3"
          style={{ gridTemplateColumns: "100px repeat(5,1fr)", gap: "6px" }}
        >
          <div />
          {days.map((d) => (
            <div
              key={d}
              className="text-center text-[11px] font-semibold text-[#64748B] tracking-wide"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Employee rows */}
        <div className="flex flex-col gap-2.5">
          {employees.map((emp, i) => (
            <div
              key={i}
              className="grid items-center"
              style={{ gridTemplateColumns: "100px repeat(5,1fr)", gap: "6px" }}
            >
              <div className="flex items-center gap-2 justify-end pe-2">
                <span className="text-[12px] font-medium text-[#334155]">{emp.name}</span>
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length].bg,
                    color: AVATAR_COLORS[i % AVATAR_COLORS.length].text,
                  }}
                >
                  {emp.initial}
                </div>
              </div>
              {emp.shifts.map((color, j) => (
                <motion.div
                  key={j}
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.06 + j * 0.03, duration: 0.32 }}
                  className="h-10 rounded-xl"
                  style={{
                    background: C[color].bg,
                    border: `1px solid ${C[color].border}`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Stat cards — inside card, full-width, no overflow */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 pt-4 border-t border-[#F1F5F9] grid grid-cols-3 gap-2"
        >
          {[
            { icon: Clock,  color: "#2563EB", bg: "#DBEAFE", value: "4.2", unit: "שע׳", label: "נחסכו השבוע" },
            { icon: Users,  color: "#10B981", bg: "#DCFCE7", value: "12",  unit: "",    label: "משמרות שובצו" },
            { icon: Shield, color: "#8B5CF6", bg: "#EDE9FE", value: "100%",unit: "",    label: "עמידה בחוק" },
          ].map(({ icon: Icon, color, bg, value, unit, label }) => (
            <div
              key={label}
              className="bg-[#F8FAFC] rounded-xl p-2.5 flex flex-col items-center text-center gap-1"
              style={{ border: "1px solid rgba(226,232,240,0.6)" }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: bg }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
              </div>
              <div className="text-[13px] font-black leading-none" style={{ color }}>
                {value}
                {unit && <span className="text-[10px] font-semibold ms-0.5 opacity-70">{unit}</span>}
              </div>
              <div className="text-[10px] text-[#64748B] leading-tight">{label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Floating badge — top inline-start (= top-right visually in RTL) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="hidden sm:flex absolute -top-5 -start-8 rounded-2xl px-4 py-3"
        style={{
          background: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
          boxShadow: "0 8px 24px rgba(109,40,217,0.3), 0 2px 8px rgba(109,40,217,0.2)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <Zap className="h-4 w-4 text-yellow-300 shrink-0" />
          <div>
            <div className="text-[12px] font-bold text-white leading-none">שיבוץ אוטומטי</div>
            <div className="text-[10px] text-white/60 mt-0.5">חכם ומדויק</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export function Hero() {
  const [videoOpen, setVideoOpen] = useState(false);
  const reduceMotion = useReducedMotion();

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
        background: "linear-gradient(160deg, #EEF2FF 0%, #F0F9FF 45%, #F8FAFC 100%)",
        minHeight: "calc(100dvh - 72px)",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Layered background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Mesh orbs */}
        <div
          style={{
            position: "absolute", top: "-10%", right: "-5%",
            width: "700px", height: "700px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 65%)",
          }}
        />
        <div
          style={{
            position: "absolute", bottom: "0", left: "10%",
            width: "500px", height: "500px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 65%)",
          }}
        />
        <div
          style={{
            position: "absolute", top: "30%", left: "25%",
            width: "400px", height: "400px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(139,92,246,0.04) 0%, transparent 65%)",
          }}
        />

        {/* Refined dot grid */}
        <div
          style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.35) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Decorative arcs — echo the schedule grid concept */}
        <svg
          className="absolute end-0 top-0 h-full"
          style={{ width: "52%", opacity: 0.06 }}
          viewBox="0 0 800 900"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <path
            d="M800 0 C600 100 700 300 500 400 C300 500 400 700 200 800"
            stroke="#2563EB" strokeWidth="2.5" fill="none"
          />
          <path
            d="M900 100 C700 200 800 400 600 500 C400 600 500 800 300 900"
            stroke="#06B6D4" strokeWidth="1.5" fill="none"
          />
          <ellipse cx="750" cy="300" rx="200" ry="200" stroke="#8B5CF6" strokeWidth="1" fill="none" opacity="0.5" />
          <ellipse cx="700" cy="300" rx="320" ry="320" stroke="#2563EB" strokeWidth="0.5" fill="none" opacity="0.4" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-[1400px] px-6 w-full py-20 lg:py-0">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-12 lg:min-h-[calc(100dvh-72px)]">

          {/* RIGHT: Copy (first in RTL DOM = right visually) */}
          <div className="flex-1 text-center lg:text-start lg:py-24">

            {/* Israel badge */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-sm font-medium text-[#334155] mb-6"
              style={{
                background: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(226,232,240,0.8)",
                boxShadow: "0 2px 12px rgba(37,99,235,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              <span className="text-base" role="img" aria-label="דגל ישראל">🇮🇱</span>
              <span>נבנה במיוחד לעסקים בישראל</span>
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                style={{ boxShadow: "0 0 6px rgba(52,211,153,0.8)" }}
              />
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="font-black text-[#0F172A] leading-[0.92] tracking-tight"
              style={{ fontSize: "clamp(3rem, 5.5vw, 5rem)", maxWidth: "680px" }}
            >
              סידורי עבודה{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: "linear-gradient(90deg, #2563EB 0%, #06B6D4 100%)",
                }}
              >
                חכמים
              </span>
              <br />
              לעסק שלך
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="mt-6 text-lg text-[#64748B] leading-[1.75]"
              style={{ maxWidth: "560px" }}
            >
              סידור4S חוסך למנהלים{" "}
              <span className="font-semibold text-[#0F172A]">4–6 שעות בשבוע</span>{" "}
              עם שיבוץ אוטומטי שמתחשב בזמינות עובדים, חוקי עבודה, העדפות ומשמרות פתוחות.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3"
            >
              <Link
                href="/login"
                className="group relative inline-flex items-center gap-2.5 h-14 px-8 rounded-2xl text-white font-bold text-base overflow-hidden transition-all hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)",
                  boxShadow: "0 8px 28px rgba(37,99,235,0.38), 0 2px 8px rgba(37,99,235,0.2)",
                }}
              >
                {/* Shimmer sweep on hover */}
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background:
                      "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.28) 50%, transparent 65%)",
                  }}
                />
                <span className="relative">התחל חינם</span>
                <ArrowLeft className="h-4 w-4 relative transition-transform group-hover:-translate-x-0.5" />
              </Link>

              <button
                type="button"
                onClick={() => setVideoOpen(true)}
                className="inline-flex items-center gap-3 h-14 px-7 rounded-2xl text-[#334155] font-medium text-base transition-all hover:-translate-y-0.5 hover:shadow-lg"
                style={{
                  background: "rgba(255,255,255,0.8)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(226,232,240,0.8)",
                  boxShadow: "0 2px 10px rgba(15,23,42,0.06)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #F1F5F9, #E2E8F0)" }}
                >
                  <Play className="h-3.5 w-3.5 text-[#334155] fill-current" />
                </div>
                <span>צפה בדמו (60 שניות)</span>
              </button>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.7 }}
              className="mt-7 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2.5"
            >
              {trustItems.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0" />
                  <span className="text-sm text-[#475569] font-medium">{item}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* LEFT: Dashboard (second in RTL DOM = left visually) */}
          <motion.div
            initial={{ opacity: 0, x: reduceMotion ? 0 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full lg:w-auto shrink-0 items-center justify-center mt-10 lg:mt-0 lg:py-24"
            aria-hidden
          >
            <DashboardMockup />
          </motion.div>

        </div>
      </div>

      <VideoModal open={videoOpen} onOpenChange={setVideoOpen} />

      <style>{`
        @media (min-width: 1024px) {
          .dashboard-card {
            width: 520px;
            transform: perspective(1400px) rotateY(-8deg) rotateX(3deg);
            will-change: transform;
          }
          .dashboard-glow {
            transform: scale(1.18) perspective(1400px) rotateY(-8deg) rotateX(3deg);
          }
        }
      `}</style>
    </section>
  );
}
