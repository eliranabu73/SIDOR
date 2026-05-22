"use client";

import * as React from "react";
import { use } from "react";
import { Calendar, Check, Clock, MapPin, RefreshCw, ShieldAlert } from "lucide-react";
import { DateTime } from "luxon";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  createSwapRequestFromShare,
  fetchEmployeeShare,
  type EmployeeShareView,
} from "@/lib/api";
import { toast } from "sonner";

type Params = { token: string };

export default function EmployeeSharePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = use(params);
  const [data, setData] = React.useState<EmployeeShareView | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchEmployeeShare(token)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError) setError(err.message);
        else setError(err instanceof Error ? err.message : "שגיאה בטעינה");
      });
  }, [token]);

  return (
    <main className="mesh-bg min-h-screen pb-12">
      <header className="sticky top-0 z-10 border-b border-border bg-card/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Logo size={26} />
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto mt-6 max-w-md px-4">
        {error ? (
          <div className="glass-card flex items-start gap-3 rounded-2xl p-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <h2 className="font-semibold">קישור לא תקף</h2>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <p className="mt-3 text-xs text-muted-foreground">
                פנו למנהל/ת ובקשו קישור חדש.
              </p>
            </div>
          </div>
        ) : !data ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ) : (
          <ShareContent data={data} token={token} />
        )}
      </div>
    </main>
  );
}

function ShareContent({ data, token }: { data: EmployeeShareView; token: string }) {
  const tz = data.organization?.defaultTimezone ?? "Asia/Jerusalem";
  const upcoming = data.shifts.filter(
    (s) => DateTime.fromISO(s.endsAt, { zone: tz }) >= DateTime.now(),
  );

  // Group by date label
  const byDay = React.useMemo(() => {
    const m = new Map<string, EmployeeShareView["shifts"]>();
    for (const s of upcoming) {
      const dt = DateTime.fromISO(s.startsAt, { zone: tz });
      const key = dt.toFormat("yyyy-MM-dd");
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [upcoming, tz]);

  return (
    <div className="space-y-4">
      {/* Greeting card */}
      <div className="glass-card rounded-2xl p-5">
        <div className="text-xs text-muted-foreground">
          {data.organization?.name}
        </div>
        <h1 className="mt-1 text-xl font-bold">
          שלום, <span className="text-gradient-brand">{data.employee.fullName}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          המשמרות שלך לשלושת השבועות הקרובים. עדכון מנהל = רענון אוטומטי.
        </p>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="משמרות קרובות" value={upcoming.length} />
        <StatCard
          label="סה״כ שעות"
          value={Math.round(
            upcoming.reduce((acc, s) => {
              const a = DateTime.fromISO(s.startsAt);
              const b = DateTime.fromISO(s.endsAt);
              return acc + b.diff(a, "hours").hours;
            }, 0),
          )}
        />
      </div>

      {/* Shifts grouped by day */}
      {byDay.length === 0 ? (
        <div className="glass-card rounded-2xl p-6 text-center text-sm text-muted-foreground">
          <Calendar className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          אין משמרות בשבועות הקרובים
        </div>
      ) : (
        byDay.map(([day, shifts]) => (
          <section key={day}>
            <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
              {DateTime.fromISO(day).setLocale("he").toFormat("EEEE · d בMMMM")}
            </div>
            <div className="space-y-2">
              {shifts.map((s) => (
                <ShiftCard key={s.id} shift={s} tz={tz} token={token} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="pt-4 text-center text-[11px] text-muted-foreground">
        סידור4S · קישור אישי בלבד · אין צורך להתחבר
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-card rounded-2xl px-4 py-3 text-center">
      <div className="text-2xl font-extrabold tabular-nums">
        <span className="text-gradient-brand">{value}</span>
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ShiftCard({
  shift,
  tz,
  token,
}: {
  shift: EmployeeShareView["shifts"][number];
  tz: string;
  token: string;
}) {
  const start = DateTime.fromISO(shift.startsAt, { zone: tz });
  const end = DateTime.fromISO(shift.endsAt, { zone: tz });
  const hours = end.diff(start, "hours").hours;
  const [requesting, setRequesting] = React.useState(false);
  const [requested, setRequested] = React.useState(false);

  const requestSwap = async () => {
    if (requesting || requested) return;
    if (!window.confirm("לבקש מהמנהל למצוא לך מחליף למשמרת הזו?")) return;
    setRequesting(true);
    try {
      await createSwapRequestFromShare(token, shift.assignmentId);
      setRequested(true);
      toast.success("הבקשה נשלחה למנהל");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שליחת הבקשה נכשלה");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Clock className="h-4 w-4 text-indigo-500" />
          {start.toFormat("HH:mm")} – {end.toFormat("HH:mm")}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {hours.toFixed(1)} שעות
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {shift.role ? (
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-indigo-500">
            {shift.role}
          </span>
        ) : null}
        {shift.location ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {shift.location}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex justify-end">
        {requested ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <Check className="h-3.5 w-3.5" />
            בקשת החלפה נשלחה
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={requestSwap}
            disabled={requesting}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {requesting ? "שולח…" : "אני לא יכול/ה להגיע"}
          </Button>
        )}
      </div>
    </div>
  );
}
