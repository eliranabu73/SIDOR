"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps protected pages. If `NEXT_PUBLIC_AUTH_DISABLED=true`, auth is bypassed
 * (matches the backend's dev escape hatch).
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
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
        if (data.session) {
          setStatus("ok");
        } else {
          setStatus("redirect");
          router.replace("/login");
        }
      } catch {
        // No supabase configured — treat as logged-in for local dev.
        setStatus("ok");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

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
