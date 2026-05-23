"use client";

import * as React from "react";
import { use } from "react";
import { DateTime } from "luxon";
import {
  Calendar,
  CalendarDays,
  Clock,
  Download,
  MapPin,
  Plane,
  ShieldAlert,
  Briefcase,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

type PortalShift = {
  id: string;
  assignmentId: string;
  startAt: string;
  endAt: string;
  role: string | null;
  location: string | null;
  status: string;
};

type PortalTimeOff = {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  status: string;
  createdAt: string;
};

type PortalData = {
  employee: {
    id: string;
    fullName: string;
    defaultLocationName: string | null;
    weeklyRestDay: string;
  };
  upcomingShifts: PortalShift[];
  pastWeekMinutes: number;
  monthSummary: { totalHours: number; totalShifts: number };
  timeOffRequests: PortalTimeOff[];
};

async function fetchPortalData(token: string): Promise<PortalData> {
  const res = await fetch(
    `${API_URL}/v1/share/employee-portal/${encodeURIComponent(token)}/me`,
  );
  const body = (await res.json().catch(() => null)) as
    | (PortalData & { message?: string })
    | { message?: string }
    | null;
  if (!res.ok) {
    const msg =
      body && "message" in body && body.message
        ? body.message
        : `שגיאה ${res.status}`;
    throw new Error(msg);
  }
  return body as PortalData;
}

async function submitTimeOff(
  token: string,
  payload: { startDate: string; endDate: string; type: string; reason?: string },
): Promise<void> {
  const res = await fetch(
    `${API_URL}/v1/share/employee-portal/${encodeURIComponent(token)}/timeoff`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.message ?? `שגיאה ${res.status}`);
  }
}

type Params = { token: string };

export default function EmployeePortalPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = use(params);
  const [data, setData] = React.useState<PortalData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetchPortalData(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "שגיאה בטעינה");
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  return (
    <main
      dir="rtl"
      lang="he"
      className="min-h-screen bg-background pb-16 text-foreground"
    >
      <header className="sticky top-0 z-10 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Logo size={26} />
          <span className="text-[11px] text-muted-foreground">
            אזור אישי לעובד
          </span>
        </div>
      </header>

      <PwaInstallBanner />

      <div className="mx-auto mt-6 max-w-md px-4">
        {error ? (
          <ErrorCard message={error} />
        ) : !data ? (
          <LoadingSkeleton />
        ) : (
          <PortalContent
            data={data}
            token={token}
            onReload={() => setReloadKey((k) => k + 1)}
          />
        )}
      </div>
    </main>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <h1 className="font-semibold text-base">קישור לא תקף</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            פנו למנהל/ת ובקשו קישור חדש.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}

function PortalContent({
  data,
  token,
  onReload,
}: {
  data: PortalData;
  token: string;
  onReload: () => void;
}) {
  const [timeOffOpen, setTimeOffOpen] = React.useState(false);
  const weekHours = Math.round((data.pastWeekMinutes / 60) * 10) / 10;
  const now = DateTime.now();
  const thisWeekShifts = data.upcomingShifts.filter((s) => {
    const dt = DateTime.fromISO(s.startAt);
    return dt.diff(now, "days").days <= 7;
  });

  return (
    <div className="space-y-4">
      {/* Header card */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="text-xs text-muted-foreground">שלום</div>
        <h1 className="mt-1 text-2xl font-bold leading-tight">
          {data.employee.fullName}
        </h1>
        {data.employee.defaultLocationName ? (
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {data.employee.defaultLocationName}
          </div>
        ) : null}

        <div className="mt-4">
          <Button
            onClick={() => setTimeOffOpen(true)}
            className="h-11 w-full"
            size="default"
          >
            <Plane className="h-4 w-4" />
            בקש חופש
          </Button>
        </div>
      </section>

      {/* This week summary */}
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="שעות שבוע שעבר" value={`${weekHours}`} suffix="ש׳" />
        <StatCard
          label="משמרות החודש"
          value={`${data.monthSummary.totalShifts}`}
          suffix={`· ${data.monthSummary.totalHours} ש׳`}
        />
      </section>

      {/* Upcoming shifts */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
          המשמרות שלי השבוע
        </h2>
        {thisWeekShifts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            <Calendar className="mx-auto mb-2 h-6 w-6" />
            אין משמרות בשבוע הקרוב
          </div>
        ) : (
          <ul className="space-y-2">
            {thisWeekShifts.map((s) => (
              <ShiftRow key={s.assignmentId} shift={s} />
            ))}
          </ul>
        )}
      </section>

      {/* Month summary card */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">סיכום חודש</div>
            <div className="mt-1 text-xl font-bold tabular-nums">
              {data.monthSummary.totalHours}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                שעות
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {data.monthSummary.totalShifts} משמרות
            </div>
          </div>
          <CalendarDays className="h-10 w-10 text-indigo-500/70" />
        </div>
      </section>

      {/* Time-off history */}
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
          היסטוריית בקשות
        </h2>
        {data.timeOffRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-xs text-muted-foreground">
            עדיין לא הגשת בקשות
          </div>
        ) : (
          <ul className="space-y-2">
            {data.timeOffRequests.map((t) => (
              <TimeOffRow key={t.id} req={t} />
            ))}
          </ul>
        )}
      </section>

      <p className="pt-4 text-center text-[11px] text-muted-foreground">
        סידור4S · קישור אישי בלבד · אין צורך להתחבר
      </p>

      <TimeOffSheet
        open={timeOffOpen}
        onOpenChange={setTimeOffOpen}
        token={token}
        onSubmitted={() => {
          setTimeOffOpen(false);
          onReload();
        }}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
      <div className="text-2xl font-extrabold tabular-nums text-indigo-500">
        {value}
        {suffix ? (
          <span className="ms-1 text-xs font-normal text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ShiftRow({ shift }: { shift: PortalShift }) {
  const start = DateTime.fromISO(shift.startAt).setLocale("he");
  const end = DateTime.fromISO(shift.endAt).setLocale("he");
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">
          {start.toFormat("EEEE · d בMMMM")}
        </div>
        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-500">
          {start.toFormat("HH:mm")}–{end.toFormat("HH:mm")}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {shift.role ? (
          <span className="inline-flex items-center gap-1">
            <Briefcase className="h-3.5 w-3.5" />
            {shift.role}
          </span>
        ) : null}
        {shift.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {shift.location}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {Math.round(end.diff(start, "hours").hours * 10) / 10} ש׳
        </span>
      </div>
    </li>
  );
}

function TimeOffRow({ req }: { req: PortalTimeOff }) {
  const start = DateTime.fromISO(req.startsAt).setLocale("he");
  const end = DateTime.fromISO(req.endsAt).setLocale("he");
  const badge = statusBadge(req.status);
  // Strip tag prefix if present
  const cleanReason =
    req.reason?.replace(/^\[(sicknote|vacation|personal)\]\s*/, "") ?? "";
  const tag = req.reason?.match(/^\[(sicknote|vacation|personal)\]/)?.[1];
  return (
    <li className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {start.toFormat("d.M")} – {end.toFormat("d.M.yy")}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      {(tag || cleanReason) && (
        <div className="mt-1 text-xs text-muted-foreground">
          {tag ? <span className="me-1">{leaveTypeLabel(tag)}</span> : null}
          {cleanReason}
        </div>
      )}
    </li>
  );
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "approved":
      return {
        label: "אושר",
        className: "bg-emerald-500/10 text-emerald-500",
      };
    case "rejected":
      return {
        label: "נדחה",
        className: "bg-rose-500/10 text-rose-500",
      };
    case "cancelled":
      return {
        label: "בוטל",
        className: "bg-muted text-muted-foreground",
      };
    default:
      return {
        label: "ממתין",
        className: "bg-amber-500/10 text-amber-500",
      };
  }
}

function leaveTypeLabel(t: string): string {
  if (t === "sicknote") return "מחלה ·";
  if (t === "vacation") return "חופשה ·";
  if (t === "personal") return "אישי ·";
  return "";
}

type LeaveType = "vacation" | "sicknote" | "personal";

function TimeOffSheet({
  open,
  onOpenChange,
  token,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string;
  onSubmitted: () => void;
}) {
  const todayIso = DateTime.now().toFormat("yyyy-MM-dd");
  const [start, setStart] = React.useState(todayIso);
  const [end, setEnd] = React.useState(todayIso);
  const [type, setType] = React.useState<LeaveType>("vacation");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    if (submitting) return;
    const startD = DateTime.fromISO(start);
    const endD = DateTime.fromISO(end);
    if (!startD.isValid || !endD.isValid) {
      toast.error("בחר/י תאריכים תקינים");
      return;
    }
    if (endD < startD) {
      toast.error("תאריך סיום חייב להיות לאחר תאריך התחלה");
      return;
    }
    setSubmitting(true);
    try {
      await submitTimeOff(token, {
        startDate: startD.startOf("day").toUTC().toISO()!,
        endDate: endD.endOf("day").toUTC().toISO()!,
        type,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success("הבקשה נשלחה");
      onSubmitted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שליחת הבקשה נכשלה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="text-right sm:max-w-md">
        <DialogHeader>
          <DialogTitle>בקשת חופש</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-muted-foreground">
              מתאריך
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              עד תאריך
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted-foreground">
              סוג הבקשה
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { v: "vacation", l: "חופשה" },
                  { v: "sicknote", l: "מחלה" },
                  { v: "personal", l: "אישי" },
                ] as { v: LeaveType; l: string }[]
              ).map((opt) => {
                const active = type === opt.v;
                return (
                  <label
                    key={opt.v}
                    className={`flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm transition ${
                      active
                        ? "border-indigo-500 bg-indigo-500/10 text-indigo-500"
                        : "border-border bg-background text-foreground"
                    }`}
                  >
                    <input
                      type="radio"
                      name="leave-type"
                      value={opt.v}
                      checked={active}
                      onChange={() => setType(opt.v)}
                      className="sr-only"
                    />
                    {opt.l}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              סיבה (אופציונלי)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={280}
              dir="rtl"
              className="mt-1 min-h-20 w-full resize-y rounded-xl border border-border bg-background p-3 text-right text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="פרטים נוספים למנהל…"
            />
          </label>
        </div>
        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button onClick={submit} disabled={submitting} className="h-11">
            {submitting ? "שולח…" : "שלח בקשה"}
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-11"
          >
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- PWA install prompt -------------------------------------------------

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function PwaInstallBanner() {
  const [evt, setEvt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("sidor4s.pwa.dismissed") === "1") {
        setDismissed(true);
      }
    } catch {
      /* ignore */
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!evt || dismissed) return null;

  const install = async () => {
    try {
      await evt.prompt();
      await evt.userChoice;
    } catch {
      /* ignore */
    } finally {
      setEvt(null);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem("sidor4s.pwa.dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto mt-3 max-w-md px-4">
      <div className="flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3 text-sm">
        <Download className="h-4 w-4 text-indigo-500" />
        <span className="flex-1 text-xs">התקן/י את האפליקציה למסך הבית</span>
        <Button size="sm" onClick={install} className="h-9">
          התקנה
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss} className="h-9">
          לא עכשיו
        </Button>
      </div>
    </div>
  );
}
