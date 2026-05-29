"use client";

import * as React from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MobileTable, type MobileTableColumn } from "@/components/ui/mobile-table";
import {
  approveTimeOff,
  getTimeOffRequests,
  rejectTimeOff,
  type TimeOffRequestItem,
  type TimeOffStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS: ReadonlyArray<{ value: TimeOffStatus; label: string }> = [
  { value: "PENDING", label: "ממתינות" },
  { value: "APPROVED", label: "מאושרות" },
  { value: "REJECTED", label: "נדחו" },
  { value: "CANCELLED", label: "בוטלו" },
];

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

function statusBadge(status: TimeOffStatus): React.ReactNode {
  const cls =
    status === "PENDING"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : status === "APPROVED"
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
        : status === "REJECTED"
          ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
          : "bg-muted text-muted-foreground border-border";
  const label =
    STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function TimeOffInner() {
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<TimeOffStatus>("PENDING");

  const queryKey = React.useMemo(() => ["timeoff", status] as const, [status]);
  const q = useQuery<TimeOffRequestItem[]>({
    queryKey,
    queryFn: () => getTimeOffRequests(status),
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => approveTimeOff(id),
    onSuccess: () => {
      toast.success("הבקשה אושרה");
      void qc.invalidateQueries({ queryKey: ["timeoff"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "אישור נכשל");
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectTimeOff(id),
    onSuccess: () => {
      toast.success("הבקשה נדחתה");
      void qc.invalidateQueries({ queryKey: ["timeoff"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "דחייה נכשלה");
    },
  });

  const busy = approveMut.isPending || rejectMut.isPending;
  const isPending = status === "PENDING";

  const columns: ReadonlyArray<MobileTableColumn<TimeOffRequestItem>> = [
    {
      header: "עובד/ת",
      accessor: (req) => <span className="font-medium">{req.employeeName}</span>,
    },
    {
      header: "טווח תאריכים",
      accessor: (req) => (
        <span className="text-muted-foreground">
          {formatRange(req.startsAt, req.endsAt)}
        </span>
      ),
    },
    {
      header: "סיבה",
      accessor: (req) => (
        <span className="text-muted-foreground">{req.reason ?? "—"}</span>
      ),
    },
    {
      header: "סטטוס",
      accessor: (req) => statusBadge(req.status),
    },
    {
      header: "פעולות",
      mobileLabel: false,
      accessor: (req) =>
        isPending ? (
          <div className="flex gap-2 justify-end">
            <Button
              size="sm"
              className="min-h-11 sm:min-h-0"
              onClick={() => approveMut.mutate(req.id)}
              disabled={busy}
            >
              אשר
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-0"
              onClick={() => rejectMut.mutate(req.id)}
              disabled={busy}
            >
              דחה
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-xl sm:text-2xl font-semibold mb-4">בקשות חופשה</h1>

      {/* Status filter chips — horizontally scrollable on mobile, wrap on desktop */}
      <div className="mb-4 -mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto sm:overflow-visible">
        <div
          role="tablist"
          aria-label="סינון לפי סטטוס"
          className="flex gap-2 min-w-max sm:min-w-0 sm:flex-wrap"
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.value === status;
            return (
              <button
                key={opt.value}
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(opt.value)}
                className={cn(
                  "inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm font-medium min-h-11 whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-accent/40",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

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
      ) : (
        <MobileTable<TimeOffRequestItem>
          data={q.data ?? []}
          keyFn={(r) => r.id}
          columns={columns}
          emptyState={
            <Card className="p-6 text-center text-sm text-muted-foreground">
              אין בקשות במסנן זה.
            </Card>
          }
        />
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        הערה: ממשק זה מבוסס על נקודות ה-API <code>/v1/timeoff</code>,
        <code>/v1/timeoff/:id/approve</code> ו-<code>/v1/timeoff/:id/reject</code>{" "}
        — עדיין לא ממומשות בשרת. הרשימה תופיע ריקה עד שהן יתווספו.
      </p>
    </div>
  );
}
