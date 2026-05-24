"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/brand/Logo";

const NAV_LINKS = [
  { label: "תכונות", href: "/#features" },
  { label: "מחירים", href: "/#pricing" },
  { label: "דמו", href: "/schedule" },
  { label: "משאבים", href: "/#resources" },
  { label: "אודות", href: "/#about" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header
        className="sticky top-0 z-40"
        style={{
          height: "72px",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(15,23,42,0.08)",
        }}
      >
        <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 flex items-center h-full justify-between">
          <Link href="/" aria-label="סידור4S — דף הבית" onClick={() => setOpen(false)}>
            <Logo size={28} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="px-4 py-2 text-sm font-medium text-[#475569] hover:text-[#0F172A] rounded-xl transition-colors hover:bg-[#F1F5F9]"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden md:inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-l from-[#2563EB] to-[#06B6D4] text-white text-sm font-semibold shadow-[0_4px_14px_rgba(37,99,235,0.3)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.4)] transition-all hover:-translate-y-px"
            >
              התחל חינם
            </Link>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl text-[#334155] transition-colors hover:bg-[#F1F5F9]"
              aria-label={open ? "סגור תפריט" : "פתח תפריט"}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
              onClick={() => setOpen(false)}
            />

            <motion.nav
              key="drawer"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-[72px] inset-x-0 z-40 md:hidden mx-3 rounded-3xl overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.97)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(226,232,240,0.9)",
                boxShadow: "0 24px 64px rgba(15,23,42,0.14), 0 4px 16px rgba(15,23,42,0.06)",
              }}
            >
              <ul className="py-3">
                {NAV_LINKS.map((l, i) => (
                  <motion.li
                    key={l.label}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.2 }}
                  >
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center px-5 py-4 text-lg font-semibold text-[#0F172A] hover:bg-[#F8FAFC] transition-colors"
                    >
                      {l.label}
                    </Link>
                    {i < NAV_LINKS.length - 1 && (
                      <div className="mx-5 h-px bg-[#F1F5F9]" />
                    )}
                  </motion.li>
                ))}
              </ul>

              <div className="px-4 pb-5 pt-2">
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl text-white font-bold text-base transition-all active:scale-[0.98]"
                  style={{
                    background: "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)",
                    boxShadow: "0 8px 28px rgba(37,99,235,0.35)",
                  }}
                >
                  <span>התחל חינם</span>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <p className="text-center text-xs text-[#94A3B8] mt-2.5">ניסיון 14 יום · ללא כרטיס אשראי</p>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
