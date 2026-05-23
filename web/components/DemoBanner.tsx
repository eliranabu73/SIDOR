"use client";

import * as React from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { useDemoMode } from "@/components/auth/DemoBoundary";

/**
 * Sticky top banner shown only in public demo mode.
 * Sits above the AppShell topbar (page-level component renders it first).
 */
export function DemoBanner() {
  const isDemo = useDemoMode();
  if (!isDemo) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 w-full bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-500 text-white shadow-sm"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="font-medium">
          <span aria-hidden>🎬 </span>
          מצב דמו — הנתונים לדוגמה. התחבר כדי לשמור שינויים.
        </span>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden />
          התחבר
        </Link>
      </div>
    </div>
  );
}
