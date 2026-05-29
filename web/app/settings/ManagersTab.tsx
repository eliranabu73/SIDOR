"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { MembersTable } from "@/components/settings/MembersTable";
import { PromoteEmployeeDialog } from "@/components/settings/PromoteEmployeeDialog";
import { Button } from "@/components/ui/button";
import { fetchOrgMembers, type OrgMember } from "@/lib/api";

/**
 * ManagersTab — "הגדרת מנהלים".
 *
 * OWNER-only. Lets the owner:
 *  - View current members + edit their roles (existing MembersTable).
 *  - Promote an existing Employee record into a manager / branch_manager
 *    by creating a Supabase auth user with the employee's email + a
 *    generated password.
 */
export default function ManagersTab() {
  const [open, setOpen] = React.useState(false);
  const [memberUserIds, setMemberUserIds] = React.useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const members = await fetchOrgMembers();
        if (cancelled) return;
        setMemberUserIds(new Set(members.map((m: OrgMember) => m.userId)));
      } catch {
        // table will surface the error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">הגדרת מנהלים</h2>
          <p className="text-sm text-muted-foreground">
            הוסף מנהלים נוספים, וקבע מנהל פר סניף. מנהל סניף יראה ויערוך רק את הנתונים של הסניף
            שלו ויוכל לשלוח את הסידור לאישור הבעלים.
          </p>
        </div>
        <Button
          variant="glow"
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto shrink-0 min-h-[44px] sm:min-h-0"
        >
          <Plus className="me-1 h-4 w-4" />
          הפוך עובד למנהל
        </Button>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>שים לב:</strong> רק בעלים יכולים לשנות הרשאות. מנהל סניף מוגבל לסידורי עבודה,
        עובדים ותלושי שכר של הסניף שלו בלבד.
      </div>

      <MembersTable key={refreshKey} />

      <PromoteEmployeeDialog
        open={open}
        onOpenChange={setOpen}
        existingMemberUserIds={memberUserIds}
        onPromoted={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
