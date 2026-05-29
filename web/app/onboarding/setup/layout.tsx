"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Logo } from "@/components/brand/Logo";
import { useOnboardingProgress } from "@/lib/onboarding-progress";

type StepId = "business" | "employees" | "shifts" | "review";

interface Step {
  id: StepId;
  label: string;
  href: string;
  doneKey: "businessDone" | "employeesDone" | "shiftsDone" | "allDone";
}

const STEPS: Step[] = [
  { id: "business", label: "עסק", href: "/onboarding/setup/business", doneKey: "businessDone" },
  { id: "employees", label: "עובדים", href: "/onboarding/setup/employees", doneKey: "employeesDone" },
  { id: "shifts", label: "משמרות", href: "/onboarding/setup/shifts", doneKey: "shiftsDone" },
  { id: "review", label: "סקירה", href: "/onboarding/setup/review", doneKey: "allDone" },
];

interface WizardNavContextValue {
  canAdvance: boolean;
  setCanAdvance: (v: boolean) => void;
  onNext: (() => void | Promise<void>) | null;
  setOnNext: (fn: (() => void | Promise<void>) | null) => void;
  nextLabel: string;
  setNextLabel: (s: string) => void;
  hideNext: boolean;
  setHideNext: (b: boolean) => void;
}

const WizardNavContext = React.createContext<WizardNavContextValue | null>(null);

/**
 * Step pages call this to register their "Next" behavior + whether the user is
 * allowed to advance. The sticky footer reads these values and renders the
 * disabled/enabled state of the primary CTA accordingly.
 */
export function useWizardNav(opts: {
  canAdvance: boolean;
  onNext?: () => void | Promise<void>;
  nextLabel?: string;
  hideNext?: boolean;
}): void {
  const ctx = React.useContext(WizardNavContext);
  if (!ctx) {
    throw new Error("useWizardNav must be used inside the onboarding/setup layout");
  }
  const { canAdvance, onNext, nextLabel = "הבא", hideNext = false } = opts;
  React.useEffect(() => {
    ctx.setCanAdvance(canAdvance);
    ctx.setOnNext(onNext ?? null);
    ctx.setNextLabel(nextLabel);
    ctx.setHideNext(hideNext);
    // We intentionally re-run whenever any of the inputs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdvance, onNext, nextLabel, hideNext]);
}

function StepIndicator({
  currentStepId,
  completed,
}: {
  currentStepId: StepId;
  completed: Record<StepId, boolean>;
}) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStepId);
  return (
    <ol className="flex w-full items-center gap-1 sm:gap-2" aria-label="שלבי הקמה">
      {STEPS.map((step, idx) => {
        const isCurrent = idx === currentIdx;
        const isDone = completed[step.id];
        const isPast = idx < currentIdx;
        return (
          <li key={step.id} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                  isDone
                    ? "border-indigo-500 bg-indigo-500 text-white"
                    : isCurrent
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                      : isPast
                        ? "border-muted-foreground/40 bg-muted text-muted-foreground"
                        : "border-muted bg-muted/40 text-muted-foreground"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isDone ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span
                className={`text-[11px] sm:text-xs ${
                  isCurrent
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <span
                className={`h-px flex-1 ${isDone || isPast ? "bg-indigo-500/60" : "bg-border"}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WizardInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const progress = useOnboardingProgress();

  const [canAdvance, setCanAdvance] = React.useState(true);
  const [onNext, setOnNext] = React.useState<(() => void | Promise<void>) | null>(null);
  const [nextLabel, setNextLabel] = React.useState("הבא");
  const [hideNext, setHideNext] = React.useState(false);

  // Reset registered handler when route changes — prevents a stale handler
  // from a previous step firing on the next step's footer click.
  React.useEffect(() => {
    setCanAdvance(true);
    setOnNext(null);
    setNextLabel("הבא");
    setHideNext(false);
  }, [pathname]);

  const ctx = React.useMemo<WizardNavContextValue>(
    () => ({
      canAdvance,
      setCanAdvance,
      onNext,
      setOnNext,
      nextLabel,
      setNextLabel,
      hideNext,
      setHideNext,
    }),
    [canAdvance, onNext, nextLabel, hideNext],
  );

  const currentIdx = Math.max(
    0,
    STEPS.findIndex((s) => pathname.startsWith(s.href)),
  );
  const currentStep = STEPS[currentIdx] ?? STEPS[0]!;
  const prevHref = currentIdx > 0 ? STEPS[currentIdx - 1]!.href : null;
  const nextHref =
    currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1]!.href : null;

  const completed: Record<StepId, boolean> = {
    business: progress.businessDone,
    employees: progress.employeesDone,
    shifts: progress.shiftsDone,
    review: progress.allDone,
  };

  const handleSkip = () => {
    try {
      window.localStorage.setItem("wizardSkipped", "true");
    } catch {
      /* localStorage unavailable — silently continue */
    }
    router.push("/schedule");
  };

  const handleNext = async () => {
    if (onNext) {
      await onNext();
      return;
    }
    if (nextHref) router.push(nextHref);
  };

  return (
    <WizardNavContext.Provider value={ctx}>
      <main className="mesh-bg flex min-h-screen flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" aria-label="סידור4S">
              <Logo size={28} />
            </Link>
            <button
              type="button"
              onClick={handleSkip}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-sm"
            >
              <X className="h-3.5 w-3.5" />
              דלג ועבור לסידור
            </button>
          </div>
          <div className="mx-auto w-full max-w-3xl px-4 pb-4">
            <StepIndicator currentStepId={currentStep.id} completed={completed} />
          </div>
        </header>

        {/* Step body */}
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-32">
          <Card className="glass-card p-4 sm:p-6">{children}</Card>
        </div>

        {/* Sticky footer */}
        <footer
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border/60 bg-background/95 backdrop-blur"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)",
          }}
        >
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
            {prevHref ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(prevHref)}
              >
                <ChevronRight className="me-1 h-4 w-4" />
                חזור
              </Button>
            ) : (
              <span />
            )}
            {!hideNext && (
              <Button
                type="button"
                variant="glow"
                onClick={handleNext}
                disabled={!canAdvance}
              >
                {nextLabel}
                <ChevronLeft className="ms-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </footer>
      </main>
    </WizardNavContext.Provider>
  );
}

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard skipMembershipCheck>
      <WizardInner>{children}</WizardInner>
    </AuthGuard>
  );
}
