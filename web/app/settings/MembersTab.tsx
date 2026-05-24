"use client";

import * as React from "react";
import { MembersTable } from "@/components/settings/MembersTable";

/**
 * MembersTab — displayed in /settings when the "הרשאות צוות" tab is active.
 *
 * Only OWNER users see this tab (the backend enforces the same restriction).
 * The tab is mounted lazily so it does not incur a network request until
 * the user clicks on it.
 */
export default function MembersTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">הרשאות צוות</h2>
        <p className="text-sm text-muted-foreground">
          הגדר הרשאות לחברי הצוות. מנהל סניף רואה ועורך רק את הנתונים של הסניף שלו.
        </p>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>שים לב:</strong> רק בעלים יכולים לשנות הרשאות. מנהל סניף מוגבל לסידורי
        עבודה, עובדים ותלושי שכר של הסניף שלו בלבד.
      </div>

      <MembersTable />
    </div>
  );
}
