"use client";

import * as React from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveTimeOff,
  getTimeOffRequests,
  rejectTimeOff,
  type TimeOffRequestItem,
} from "@/lib/api";

const TIMEOFF_PENDING_KEY = ["timeoff", "pending"] as const;

export default function TimeOffPage() {
  return (
    <AuthGuard>
      <AppShell>
        <TimeOffInner />
      </AppShell>
    </AuthGuard>
  );
}

function formatRange(startsAt: string, endsAt: string): string {
  try {
    const s = new Date(startsAt);
    const e = new Date(endsAt);
    const fmt = new Intl.DateTimeFormat("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${fmt.format(s)} — ${fmt.format(e)}`;
  } catch {
    return `${startsAt} — ${endsAt}`;
  }
}

function TimeOffInner() {
  const qc = useQueryClient();
  const q = useQuery<TimeOffRequestItem[]>({
    queryKey: TIMEOFF_PENDING_KEY,
    queryFn: () => getTimeOffRequests("PENDING"),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveTimeOff(id),
    onSuccess: () => {
      toast.success("הבקשה אושרה");
      void qc.invalidateQueries({ queryKey: TIMEOFF_PENDING_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "אישור נכשל");
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectTimeOff(id),
    onSuccess: () => {
      toast.success("הבקשה נדחתה");
      void qc.invalidateQueries({ queryKey: TIMEOFF_PENDING_KEY });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "דחייה נכשלה");
    },
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-xl font-semibold mb-4">בקשות חופשה ממתינות</h1>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : q.isError ? (
        <Card className="p-4 text-sm text-destructive">
          טעינת הבקשות נכשלה. ייתכן שנקודת ה-API טרם זמינה בשרת.
        </Card>
      ) : (q.data ?? []).length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          אין בקשות ממתינות כרגע.
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-right text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 px-3 font-medium">עובד/ת</th>
                <th className="py-2 px-3 font-medium">טווח תאריכים</th>
                <th className="py-2 px-3 font-medium">סיבה</th>
                <th className="py-2 px-3 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {(q.data ?? []).map((req) => (
                <tr key={req.id} className="border-b last:border-b-0">
                  <td className="py-2 px-3 font-medium">{req.employeeName}</td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {formatRange(req.startsAt, req.endsAt)}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground">
                    {req.reason ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveMut.mutate(req.id)}
                        disabled={approveMut.isPending || rejectMut.isPending}
                      >
                        אשר
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectMut.mutate(req.id)}
                        disabled={approveMut.isPending || rejectMut.isPending}
                      >
                        דחה
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        הערה: ממשק זה מבוסס על נקודות ה-API <code>/v1/timeoff</code>,
        <code>/v1/timeoff/:id/approve</code> ו-<code>/v1/timeoff/:id/reject</code>{" "}
        — עדיין לא ממומשות בשרת. הרשימה תופיע ריקה עד שהן יתווספו.
      </p>
    </div>
  );
}
