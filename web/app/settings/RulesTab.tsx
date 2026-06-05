"use client";

import * as React from "react";
import { RulesWizard } from "@/components/rules/RulesWizard";

/**
 * Settings → "כללי סידור" tab. Hosts the same RulesWizard used in onboarding, so a
 * manager can revisit and edit day-parts, headcounts and fixed people anytime. The
 * wizard fetches and saves its own data; this tab is a thin shell.
 */
export default function RulesTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        כאן מגדירים איך נראה שבוע טיפוסי — חלקי יום, כמה אנשים בכל אחד, ומי קבוע.
        השינויים נשמרים כתבנית שבועית שממנה נבנה כל סידור חדש בלחיצה.
      </p>
      <RulesWizard mode="settings" primaryLabel="שמור כללים" />
    </div>
  );
}
