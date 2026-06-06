"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Logo } from "@/components/brand/Logo";

/**
 * Canonical onboarding entry point.
 *
 * Historically this page hosted a separate "60-second quick" form (name +
 * industry + employee count) while the full multi-step wizard lived under
 * /onboarding/setup/*. Having BOTH meant a new user could land on two different
 * "set up your business" forms depending on the entry path (post-login redirect
 * vs. the membership guard) — confusing, and a frequent "why are there two
 * forms?" report. We now keep a SINGLE onboarding flow (the wizard) and redirect
 * this route to its first step. The wizard's business step does the same atomic
 * quick-bootstrap under the hood, so nothing is lost.
 */
function OnboardingRedirect() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace("/onboarding/setup/business");
  }, [router]);

  return (
    <main className="mesh-bg flex min-h-screen items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={36} />
        <p className="text-sm text-muted-foreground">מכינים את ההגדרה שלך…</p>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGuard skipMembershipCheck>
      <OnboardingRedirect />
    </AuthGuard>
  );
}
