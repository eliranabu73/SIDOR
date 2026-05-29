"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMe } from "@/lib/api";

interface DemoModeContextValue {
  isDemo: boolean;
}

const DemoModeContext = React.createContext<DemoModeContextValue>({
  isDemo: false,
});

export function useDemoMode(): boolean {
  return React.useContext(DemoModeContext).isDemo;
}

interface DemoBoundaryProps {
  children: React.ReactNode;
  /** Skip the membership check (mirrors AuthGuard). */
  skipMembershipCheck?: boolean;
}

/**
 * Like AuthGuard, but with a public demo fallback.
 *
 *   - If no Supabase session → render children in demo mode (isDemo=true).
 *   - If session exists → behave like AuthGuard:
 *       1. Session ok → continue
 *       2. /v1/me memberships ≥ 1 → continue
 *       3. Else redirect to /onboarding
 *
 * Children can call useDemoMode() to branch between mock and real data.
 */
export function DemoBoundary({
  children,
  skipMembershipCheck,
}: DemoBoundaryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = React.useState<"loading" | "ok" | "demo" | "redirect">(
    "loading",
  );

  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_DISABLED === "true") {
      setStatus("ok");
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!data.session) {
          // No session → public demo mode (no redirect).
          setStatus("demo");
          return;
        }
        if (skipMembershipCheck) {
          setStatus("ok");
          return;
        }
        try {
          const me = await fetchMe();
          if (!mounted) return;
          if (
            me.memberships.length === 0 &&
            pathname !== "/onboarding" &&
            !pathname.startsWith("/onboarding/")
          ) {
            // Honor an explicit "I'll set up later" preference — the schedule
            // SetupChecklist nags them instead of a forced wizard redirect.
            let skipped = false;
            try {
              skipped =
                window.localStorage.getItem("wizardSkipped") === "true";
            } catch {
              skipped = false;
            }
            if (!skipped) {
              setStatus("redirect");
              router.replace("/onboarding/setup/business");
              return;
            }
          }
          setStatus("ok");
        } catch {
          // /v1/me failure → let user through; pages surface their own errors.
          setStatus("ok");
        }
      } catch {
        // Supabase not configured at all → treat as demo (safe public fallback).
        setStatus("demo");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router, pathname, skipMembershipCheck]);

  if (status === "loading" || status === "redirect") {
    return (
      <div className="p-8 space-y-3" aria-label="טוען">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  const isDemo = status === "demo";
  return (
    <DemoModeContext.Provider value={{ isDemo }}>
      {children}
    </DemoModeContext.Provider>
  );
}
