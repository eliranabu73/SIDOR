"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, MessageCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { fetchConfirmations, type ConfirmationsData } from "@/lib/api";

type EmployeeConfirmEntry = ConfirmationsData["employees"][number];

function waReminderLink(
  employee: EmployeeConfirmEntry,
  weekLabel: string,
  portalUrl: string,
): string {
  const msg =
    `שלום ${employee.fullName}, טרם אישרת את המשמרות שלך לשבוע ${weekLabel}.\n` +
    `לחץ כאן לאישור: ${portalUrl}`;
  const phone = employee.phone?.replace(/[^\d]/g, "") ?? "";
  const normalised = phone.startsWith("0") ? `972${phone.slice(1)}` : phone;
  if (normalised) {
    return `https://wa.me/${normalised}?text=${encodeURIComponent(msg)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  scheduleId: string;
  isPublished: boolean;
  weekLabel: string; // e.g. "2026-05-25"
  /** Base URL for employee portal (without token). Used for reminder links. */
  portalBaseUrl?: string;
};

export function ConfirmationStatus({
  scheduleId,
  isPublished,
  weekLabel,
  portalBaseUrl,
}: Props) {
  const [reminderOpen, setReminderOpen] = React.useState(false);

  // Shared react-query key — ConfirmationPill reads the SAME key, so the two
  // widgets coalesce into a single /v1/schedules/:id/confirmations request
  // instead of firing one each on every schedule-page load.
  const {
    data,
    isLoading: loading,
    isError,
    refetch,
  } = useQuery<ConfirmationsData>({
    queryKey: ["confirmations", scheduleId],
    queryFn: () => fetchConfirmations(scheduleId),
    enabled: isPublished,
    staleTime: 30_000,
    retry: 1,
  });
  const load = () => {
    void refetch();
  };

  if (!isPublished) return null;

  if (loading && !data) {
    return <Skeleton className="h-16 w-full rounded-2xl" />;
  }

  if (isError && !data) {
    return (
      <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <span>לא ניתן לטעון את מצב האישורים כעת. נסו לרענן.</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-muted-foreground"
          onClick={load}
        >
          רענן
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const pct = data.total > 0 ? Math.round((data.confirmed / data.total) * 100) : 0;

  return (
    <>
      <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" />
            אישורים
          </div>
          <span className="text-sm font-bold tabular-nums">
            {data.confirmed}/{data.total}
            <span className="ms-1 text-xs font-normal text-muted-foreground">
              עובדים
            </span>
          </span>
        </div>

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="אחוז העובדים שאישרו את המשמרות"
          className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {data.pending > 0
              ? `${data.pending} ממתינים לאישור`
              : "כולם אישרו"}
          </span>
          {data.pending > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={() => setReminderOpen(true)}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              שלח תזכורת
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground"
            onClick={load}
          >
            רענן
          </Button>
        </div>
      </div>

      <ReminderSheet
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        employees={data.employees.filter((e) => !e.confirmedAt)}
        weekLabel={weekLabel}
        portalBaseUrl={portalBaseUrl ?? `${process.env.NEXT_PUBLIC_WEB_URL ?? ""}/me`}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Reminder sheet — lists unconfirmed employees with per-employee WA link
// ---------------------------------------------------------------------------

function ReminderSheet({
  open,
  onOpenChange,
  employees,
  weekLabel,
  portalBaseUrl,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: EmployeeConfirmEntry[];
  weekLabel: string;
  portalBaseUrl: string;
}) {
  if (employees.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="max-h-[80dvh] w-full overflow-y-auto sm:max-w-md" dir="rtl">
        <SheetHeader className="mb-4 text-right">
          <SheetTitle>שליחת תזכורות — {employees.length} ממתינים</SheetTitle>
        </SheetHeader>
        <ul className="space-y-3 pb-8">
          {employees.map((emp) => (
            <ReminderRow
              key={emp.employeeId}
              employee={emp}
              weekLabel={weekLabel}
              portalBaseUrl={portalBaseUrl}
            />
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function ReminderRow({
  employee,
  weekLabel,
  portalBaseUrl,
}: {
  employee: EmployeeConfirmEntry;
  weekLabel: string;
  portalBaseUrl: string;
}) {
  // We don't have the token here — the manager will send via the WA button
  // which opens a pre-filled wa.me link pointing to the portal base URL.
  // The employee already has their personal link from the original publish.
  const link = waReminderLink(
    employee,
    weekLabel,
    `${portalBaseUrl}/${employee.employeeId}`,
  );

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{employee.fullName}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {employee.shiftCount === 1
            ? "משמרת אחת"
            : `${employee.shiftCount} משמרות`}{" "}
          · טרם אישר/ה
        </div>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => toast.info(`שולח תזכורת ל-${employee.fullName}`)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#20b858]"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        שלח תזכורת
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Mini inline widget for schedule page toolbar / sidebar
// ---------------------------------------------------------------------------

export function ConfirmationPill({
  scheduleId,
  isPublished,
}: {
  scheduleId: string;
  isPublished: boolean;
}) {
  // Reuses the SAME query key as ConfirmationStatus → no extra network call.
  const { data } = useQuery<ConfirmationsData>({
    queryKey: ["confirmations", scheduleId],
    queryFn: () => fetchConfirmations(scheduleId),
    enabled: isPublished,
    staleTime: 30_000,
    retry: 1,
  });

  if (!isPublished || !data) return null;

  const allConfirmed = data.confirmed >= data.total && data.total > 0;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        allConfirmed
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      }`}
    >
      <CheckCircle2 className="h-3 w-3" />
      {data.confirmed}/{data.total} אישורים
    </span>
  );
}
