"use client";

import * as React from "react";
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

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

type EmployeeConfirmEntry = {
  employeeId: string;
  fullName: string;
  phone: string | null;
  confirmedAt: string | null;
  confirmedVia: string | null;
  shiftCount: number;
  confirmedShiftCount: number;
};

type ConfirmationsData = {
  total: number;
  confirmed: number;
  pending: number;
  employees: EmployeeConfirmEntry[];
};

async function fetchConfirmations(
  scheduleId: string,
): Promise<ConfirmationsData> {
  const res = await fetch(
    `${API_URL}/v1/schedules/${encodeURIComponent(scheduleId)}/confirmations`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`שגיאה ${res.status}`);
  return res.json() as Promise<ConfirmationsData>;
}

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
  const [data, setData] = React.useState<ConfirmationsData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reminderOpen, setReminderOpen] = React.useState(false);

  const load = React.useCallback(() => {
    if (!isPublished) return;
    setLoading(true);
    fetchConfirmations(scheduleId)
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "שגיאת טעינה"),
      )
      .finally(() => setLoading(false));
  }, [scheduleId, isPublished]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (!isPublished) return null;

  if (loading && !data) {
    return <Skeleton className="h-16 rounded-2xl" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        לא ניתן לטעון אישורים: {error}
      </div>
    );
  }

  if (!data) return null;

  const pct = data.total > 0 ? Math.round((data.confirmed / data.total) * 100) : 0;

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2">
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
      <SheetContent side="right" className="max-h-[80vh] w-full overflow-y-auto sm:max-w-md" dir="rtl">
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
          {employee.shiftCount} משמרות · טרם אישר/ה
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
  const [data, setData] = React.useState<Pick<
    ConfirmationsData,
    "confirmed" | "total"
  > | null>(null);

  React.useEffect(() => {
    if (!isPublished) return;
    fetchConfirmations(scheduleId)
      .then((d) => setData({ confirmed: d.confirmed, total: d.total }))
      .catch(() => {/* silent */});
  }, [scheduleId, isPublished]);

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
