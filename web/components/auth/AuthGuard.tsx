"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchMe } from "@/lib/api";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Skip the membership check (used by /onboarding itself). */
  skipMembershipCheck?: boolean;
}

/**
 * Wraps protected pages. Three gates, in order:
 *   1. Supabase session present → else redirect to /login
 *   2. /v1/me returns ≥1 membership → else redirect to /onboarding
 *   3. Children render.
 *
 * If `NEXT_PUBLIC_AUTH_DISABLED=true`, ALL gates are bypassed (dev/demo mode).
 */
export function AuthGuard({ children, skipMembershipCheck }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = React.useState<"loading" | "ok" | "redirect">(
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
          setStatus("redirect");
          router.replace("/login");
          return;
        }
        // Session is present (this is an instant, local read). Render the page
        // IMMEDIATELY — do NOT block first paint on /v1/me, which is a slow
        // cold-start serverless call (observed ~6s) and was the dominant cause
        // of the blank-screen-until-LCP. The membership → onboarding redirect
        // runs in the background; a freshly-onboarded user with ≥1 membership
        // (the common case) never sees a delay.
        setStatus("ok");
        if (skipMembershipCheck) return;
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
              router.replace("/onboarding/setup/business");
            }
          }
        } catch {
          // /v1/me failed (cold start / backend transient) — already rendering;
          // pages surface their own errors.
        }
      } catch {
        // No supabase configured — treat as logged-in for local dev.
        setStatus("ok");
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
  return <>{children}</>;
}
