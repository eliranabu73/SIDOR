"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Building2,
  Check,
  Edit2,
  Sparkles,
  Sunrise,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboardingProgress } from "@/lib/onboarding-progress";
import { useWizardNav } from "../layout";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full ${
        ok
          ? "bg-emerald-500 text-white"
          : "bg-amber-500/20 text-amber-700 dark:text-amber-300"
      }`}
      aria-label={ok ? "הושלם" : "חסר"}
    >
      {ok ? <Check className="h-3 w-3" /> : "!"}
    </span>
  );
}

function SummaryCard({
  href,
  icon,
  title,
  done,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-indigo-600 dark:text-indigo-400">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{title}</h3>
              <StatusDot ok={done} />
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{children}</div>
          </div>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Edit2 className="h-3 w-3" />
          ערוך
        </Link>
      </div>
    </div>
  );
}

const DAY_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

export default function ReviewStepPage() {
  const router = useRouter();
  const progress = useOnboardingProgress();
  const [submitting, setSubmitting] = React.useState(false);

  const me = progress.me;
  const settings = progress.settings;
  const orgId = me?.activeOrgId ?? me?.memberships?.[0]?.orgId ?? null;

  const employeesCount = progress.employees?.length ?? 0;
  const templatesCount = progress.shiftTemplates?.length ?? 0;
  const branch = settings?.locations[0];
  const businessHours =
    settings?.laborRules.businessHoursStart && settings?.laborRules.businessHoursEnd
      ? `${settings.laborRules.businessHoursStart}–${settings.laborRules.businessHoursEnd}`
      : null;
  const activeDays = (
    settings?.laborRules as unknown as { activeDaysOfWeek?: number[] } | undefined
  )?.activeDaysOfWeek;

  const onBuildSchedule = React.useCallback(async () => {
    if (!orgId) {
      toast.error("ארגון לא נמצא — חזור לשלב 1 ושמור את הפרטים.");
      return;
    }
    setSubmitting(true);
    try {
      // Clear the skip flag — user explicitly completed the wizard.
      try {
        window.localStorage.removeItem("wizardSkipped");
      } catch {
        /* ignore */
      }
      // Reuse the existing quick-schedule polling page: it watches the
      // onboarding-status endpoint and forwards to /schedule once shifts
      // have been materialized by the bootstrap transaction (or after a
      // short max-wait window).
      router.replace(
        `/onboarding/quick-schedule?org=${encodeURIComponent(orgId)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "בניית הסידור נכשלה";
      toast.error(msg);
      setSubmitting(false);
    }
  }, [orgId, router]);

  // The review screen owns its own primary CTA, so hide the layout's "Next".
  useWizardNav({ canAdvance: true, hideNext: true });

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">סקירה אחרונה</h1>
          <p className="text-sm text-muted-foreground">
            כל הפרטים נשמרו — מוכן לבנות את הסידור הראשון שלך?
          </p>
        </div>
      </header>

      <div className="space-y-2">
        <SummaryCard
          href="/onboarding/setup/business"
          icon={<Building2 className="h-5 w-5" />}
          title="פרטי העסק"
          done={progress.businessDone}
        >
          <div className="space-y-0.5">
            <div>{settings?.name ?? "—"}</div>
            {branch && <div>סניף: {branch.name}</div>}
            {businessHours && (
              <div dir="ltr" className="text-end">
                {businessHours}
              </div>
            )}
            {activeDays && activeDays.length > 0 && (
              <div>
                ימים: {activeDays.map((d) => DAY_SHORT[d]).join(" ")}
              </div>
            )}
          </div>
        </SummaryCard>

        <SummaryCard
          href="/onboarding/setup/employees"
          icon={<Users className="h-5 w-5" />}
          title="עובדים"
          done={progress.employeesDone}
        >
          {employeesCount === 0 ? (
            <span className="text-amber-700 dark:text-amber-300">
              עדיין לא נוספו עובדים
            </span>
          ) : (
            <span>
              {employeesCount} עובד{employeesCount === 1 ? "" : "ים"}
            </span>
          )}
        </SummaryCard>

        <SummaryCard
          href="/onboarding/setup/shifts"
          icon={<Sunrise className="h-5 w-5" />}
          title="תבניות משמרת"
          done={progress.shiftsDone}
        >
          {templatesCount === 0 ? (
            <span className="text-amber-700 dark:text-amber-300">
              עדיין לא הוגדרו תבניות
            </span>
          ) : (
            <span>
              {templatesCount} תבנית{templatesCount === 1 ? "" : "ות"}
            </span>
          )}
        </SummaryCard>
      </div>

      <Button
        type="button"
        variant="glow"
        size="lg"
        className="w-full"
        onClick={onBuildSchedule}
        disabled={submitting || !progress.allDone || !orgId}
      >
        <Sparkles className="me-2 h-5 w-5" />
        {submitting ? "בונה סידור…" : "בנה לי סידור ראשון"}
      </Button>

      {!progress.allDone && (
        <p className="text-center text-xs text-muted-foreground">
          השלם את כל השלבים שמעלה כדי להפעיל את בניית הסידור.
        </p>
      )}
    </div>
  );
}
