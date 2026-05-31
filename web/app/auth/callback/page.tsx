"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { fetchMe } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        const supabase = getSupabase();
        // Wait briefly for the SDK to consume the URL hash / code from
        // detectSessionInUrl. Poll up to 2s.
        const start = Date.now();
        let session: Awaited<
          ReturnType<typeof supabase.auth.getSession>
        >["data"]["session"] = null;

        while (Date.now() - start < 2000) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            session = data.session;
            break;
          }
          await new Promise((r) => setTimeout(r, 150));
        }

        if (cancelled) return;

        if (!session) {
          router.replace("/login?error=auth_failed");
          return;
        }

        // Resolve membership with retries — the backend may be cold and a
        // transient /v1/me failure must NOT route an already-onboarded user to
        // /onboarding, where a second org would be bootstrapped (one-org-per-user).
        let me: Awaited<ReturnType<typeof fetchMe>> | null = null;
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
          try {
            me = await fetchMe();
            break;
          } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
        if (cancelled) return;

        if (!me) {
          // Still failing after retries — send to login rather than risk
          // duplicate-org onboarding for a user who may already have one.
          console.error("auth callback: /v1/me unreachable", lastErr);
          router.replace("/login?error=session_check_failed");
          return;
        }
        if (!me.memberships || me.memberships.length === 0) {
          router.replace("/onboarding");
        } else {
          router.replace("/schedule");
        }
      } catch {
        if (!cancelled) router.replace("/login?error=auth_failed");
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [router]);

  return (
    <div className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <div
        className="glass-card flex items-center gap-3 rounded-xl px-6 py-4"
        role="status"
        aria-live="polite"
      >
        <span
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          aria-hidden="true"
        />
        <span className="text-sm">מתחבר…</span>
      </div>
    </div>
  );
}
