"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { adminApi } from "@/lib/api";

/**
 * Once per signed-in session, ask /v1/admin/check and cache the result.
 * If the user IS a platform admin and is currently on the root landing or
 * a manager-side route (schedule / employees / swaps / fairness / ...),
 * redirect them to /admin. The admin panel is the *only* surface for
 * platform-admin users — they should not see the manager UI.
 *
 * Pure UX redirect: backend admin endpoints are independently gated by
 * isPlatformAdmin via the JWT email allowlist.
 */
const MANAGER_PATHS = [
  "/schedule",
  "/employees",
  "/swaps",
  "/fairness",
  "/timeoff",
  "/timetracking",
  "/tips",
  "/settings",
];

const CACHE_KEY = "sidor.isAdmin";

export function AdminAutoRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (!pathname) return;
    const isRoot = pathname === "/";
    const isManager = MANAGER_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    if (!isRoot && !isManager) return;

    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;

        // Fast path: cached decision.
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached === "1") {
          if (!cancelled) router.replace("/admin");
          return;
        }
        if (cached === "0") return;

        const res = await adminApi.check();
        if (cancelled) return;
        sessionStorage.setItem(CACHE_KEY, res.isAdmin ? "1" : "0");
        if (res.isAdmin) router.replace("/admin");
      } catch {
        // ignore — page renders normally
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
