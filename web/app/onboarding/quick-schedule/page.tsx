"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { getSupabase } from "@/lib/supabase";

const PHASES: string[] = [
  "בודק חוקי עבודה ומנוחה...",
  "מאזן שעות בין עובדים...",
  "מחשב עלויות...",
  "מסדר את המשמרות לפי ההעדפות...",
  "כמעט מוכן — מלטש את הפרטים האחרונים...",
];

const POLL_INTERVAL_MS = 800;
const MAX_WAIT_MS = 30_000;

interface OnboardingStatus {
  ready: boolean;
  scheduleId?: string;
}

async function fetchStatus(orgId: string): Promise<OnboardingStatus> {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (data.session?.access_token) {
    headers["authorization"] = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(
    `${apiUrl}/v1/orgs/${encodeURIComponent(orgId)}/onboarding-status`,
    { headers },
  );
  if (!res.ok) {
    return { ready: false };
  }
  return (await res.json()) as OnboardingStatus;
}

function QuickScheduleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org");
  const [phaseIdx, setPhaseIdx] = React.useState(0);
  const [progress, setProgress] = React.useState(8);

  // Rotate copy.
  React.useEffect(() => {
    const t = window.setInterval(() => {
      setPhaseIdx((i) => (i + 1) % PHASES.length);
    }, 1800);
    return () => window.clearInterval(t);
  }, []);

  // Progress bar tween toward 95%.
  React.useEffect(() => {
    const t = window.setInterval(() => {
      setProgress((p) => (p < 95 ? p + Math.max(0.5, (95 - p) * 0.06) : p));
    }, 200);
    return () => window.clearInterval(t);
  }, []);

  // Poll until ready or timeout.
  React.useEffect(() => {
    if (!orgId) {
      toast.error("חסר מזהה ארגון — חוזרים לאשף.");
      router.replace("/onboarding");
      return;
    }
    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      try {
        const status = await fetchStatus(orgId);
        if (cancelled) return;
        if (status.ready) {
          setProgress(100);
          // tiny visual settle before redirecting
          window.setTimeout(() => {
            if (!cancelled) router.replace("/schedule");
          }, 350);
          return;
        }
      } catch {
        // swallow — keep polling
      }
      if (elapsed >= MAX_WAIT_MS) {
        if (!cancelled) {
          toast.message("הסידור עדיין נבנה ברקע — ממשיכים לעמוד הסידור.");
          router.replace("/schedule");
        }
        return;
      }
      window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [orgId, router]);

  return (
    <main className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <div className="glass-card relative w-full max-w-md rounded-2xl border border-border bg-card/60 p-8 text-center shadow-xl">
        <div className="mb-6 flex justify-center">
          <Logo size={40} />
        </div>

        {/* Pulsing dot constellation */}
        <div
          className="mx-auto mb-6 flex h-24 w-24 items-center justify-center"
          aria-hidden
        >
          <div className="relative h-full w-full">
            <span className="absolute inset-0 animate-ping rounded-full bg-indigo-500/30" />
            <span className="absolute inset-2 animate-pulse rounded-full bg-indigo-500/50" />
            <span className="absolute inset-5 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-[0_0_24px_rgb(99_102_241/0.6)]" />
          </div>
        </div>

        <h1 className="text-xl font-semibold">בונים לך סידור חכם…</h1>
        <p
          key={phaseIdx}
          className="mt-2 min-h-[1.5rem] animate-in fade-in slide-in-from-bottom-1 text-sm text-muted-foreground duration-500"
        >
          {PHASES[phaseIdx]}
        </p>

        {/* Progress bar */}
        <div
          className="mt-6 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="בונה סידור"
        >
          <div
            className="h-full rounded-full bg-gradient-to-l from-indigo-500 via-violet-500 to-cyan-400 transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          זה בדרך כלל לוקח פחות מ-10 שניות.
        </p>
      </div>
    </main>
  );
}

function QuickScheduleFallback() {
  return (
    <main className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <div className="glass-card w-full max-w-md rounded-2xl border border-border bg-card/60 p-8 text-center">
        <div className="mb-4 flex justify-center">
          <Logo size={40} />
        </div>
        <p className="text-sm text-muted-foreground">טוען…</p>
      </div>
    </main>
  );
}

export default function QuickSchedulePage() {
  return (
    <AuthGuard skipMembershipCheck>
      <React.Suspense fallback={<QuickScheduleFallback />}>
        <QuickScheduleInner />
      </React.Suspense>
    </AuthGuard>
  );
}
