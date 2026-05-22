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
        if (skipMembershipCheck) {
          setStatus("ok");
          return;
        }
        try {
          const me = await fetchMe();
          if (!mounted) return;
          if (me.memberships.length === 0 && pathname !== "/onboarding") {
            setStatus("redirect");
            router.replace("/onboarding");
            return;
          }
          setStatus("ok");
        } catch {
          // /v1/me failed (cold start / backend transient) — let user through;
          // pages will surface their own errors.
          setStatus("ok");
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
