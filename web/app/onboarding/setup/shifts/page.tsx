"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sunrise } from "lucide-react";
import { RulesWizard } from "@/components/rules/RulesWizard";
import { useOnboardingProgress } from "@/lib/onboarding-progress";
import { useWizardNav } from "../layout";

/**
 * Onboarding step 3 — "כללי סידור". Hosts the reusable RulesWizard, which captures
 * day-parts (morning/evening headcount + windows) and fixed people, saving them as
 * a recurring weekly template + soft employee preferences. The wizard's own
 * "שמור והמשך" button drives navigation; the footer "Next" stays available once the
 * rules are saved (so a returning user can skip straight ahead).
 */
export default function RulesStepPage() {
  const router = useRouter();
  const progress = useOnboardingProgress();

  const onNext = React.useCallback(() => {
    router.push("/onboarding/setup/review");
  }, [router]);

  useWizardNav({ canAdvance: progress.shiftsDone, onNext });

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Sunrise className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">כללי הסידור</h1>
          <p className="text-sm text-muted-foreground">
            הגדר פעם אחת איך נראה שבוע טיפוסי — כמה אנשים בכל חלק יום ומי קבוע. מכאן
            ואילך כל סידור שבועי נבנה בלחיצה.
          </p>
        </div>
      </header>

      <RulesWizard
        mode="onboarding"
        primaryLabel="שמור והמשך לסקירה"
        onSaved={onNext}
      />
    </div>
  );
}
