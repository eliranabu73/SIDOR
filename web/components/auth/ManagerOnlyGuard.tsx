"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi } from "@/lib/api";

/**
 * Wraps manager-side pages (schedule / employees / swaps / fairness / ...).
 *
 * Behaviour:
 *   1. Supabase session present → else redirect to /login.
 *   2. If the user IS in PLATFORM_ADMIN_EMAILS (server-side check via
 *      /v1/admin/check) they are a *platform admin*, not a manager —
 *      redirect them to /admin. This keeps the admin-only experience
 *      clean: admins never see the manager UI.
 *   3. Otherwise render children.
 *
 * If /v1/admin/check errors we render anyway (graceful degradation —
 * the page itself is auth-protected on the backend).
 */
export function ManagerOnlyGuard({ children }: { children: React.ReactNode }) {
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
          if (res.isAdmin) {
            setStatus("redirect");
            router.replace("/admin");
            return;
          }
        } catch {
          // /admin/check unreachable — let the page render; backend
          // routes still enforce their own auth.
        }
        if (!mounted) return;
        setStatus("ok");
      } catch {
        if (!mounted) return;
        setStatus("ok");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (status === "redirect") {
    return (
      <div className="p-8 space-y-3" aria-label="טוען">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
