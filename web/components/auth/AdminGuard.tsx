"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api";

/**
 * Wraps platform-admin pages. Gates in order:
 *   1. Supabase session present → else redirect to /login
 *   2. GET /v1/admin/check returns { isAdmin: true } → else redirect to /
 *   3. Children render.
 *
 * The server is the source of truth — it re-checks the JWT email against
 * PLATFORM_ADMIN_EMAILS on every admin call. The client-side gate here is
 * purely UX so non-admins don't see the dashboard shell flash.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"loading" | "ok" | "redirect">(
    "loading",
  );

  React.useEffect(() => {
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
        try {
          const res = await adminApi.check();
          if (!mounted) return;
          if (!res.isAdmin) {
            setStatus("redirect");
            router.replace("/");
            return;
          }
          setStatus("ok");
        } catch {
          if (!mounted) return;
          setStatus("redirect");
          router.replace("/");
        }
      } catch {
        // No supabase configured — block by default.
        setStatus("redirect");
        router.replace("/");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (status !== "ok") {
    return (
      <div className="p-8 space-y-3" aria-label="טוען">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
