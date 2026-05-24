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
  deleteTipPool,
  fetchLocations,
  fetchTipPools,
  previewTipDistribution,
  recordTipPool,
  type LocationItem,
  type TipDistributionPreview,
  type TipPoolItem,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthRangeIso(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(last).padStart(2, "0")}` };
}

function formatAgorot(agorot: number): string {
  return `₪${(agorot / 100).toFixed(2)}`;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} שעות`;
  return `${h}:${String(m).padStart(2, "0")} שעות`;
}

function formatDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export default function TipsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <TipsInner />
      </AppShell>
    </AuthGuard>
  );
}

// ---------------------------------------------------------------------------
// TipsInner — main content
// ---------------------------------------------------------------------------

function TipsInner() {
  const qc = useQueryClient();
  const { start: defaultStart, end: defaultEnd } = monthRangeIso();

  // Form state
  const [shiftDate, setShiftDate] = React.useState(todayIso());
  const [locationId, setLocationId] = React.useState<string>("");
  const [totalShekel, setTotalShekel] = React.useState<string>("");
  const [note, setNote] = React.useState<string>("");

  // History filter
  const [histStart, setHistStart] = React.useState(defaultStart);
  const [histEnd, setHistEnd] = React.useState(defaultEnd);

  // Preview state
  const [preview, setPreview] = React.useState<TipDistributionPreview[] | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  // Locations
  const locQuery = useQuery<LocationItem[]>({
    queryKey: ["locations"],
    queryFn: () => fetchLocations(),
    staleTime: 5 * 60_000,
  });

  // History
  const histKey = ["tips", "history", histStart, histEnd, locationId];
  const histQuery = useQuery<TipPoolItem[]>({
    queryKey: histKey,
    queryFn: () => fetchTipPools(histStart, histEnd, locationId || undefined),
  });

  // Compute total agorot from shekel input
  const totalAgorot = React.useMemo(() => {
    const n = parseFloat(totalShekel.replace(",", "."));
    if (isNaN(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [totalShekel]);

  // -----------------------------------------------------------------------
  // Preview handler
  // -----------------------------------------------------------------------
  const handlePreview = async () => {
    if (!totalAgorot || !shiftDate) {
      toast.error("יש להזין תאריך וסכום טיפים");
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await previewTipDistribution(
        shiftDate,
        totalAgorot,
        locationId || undefined,
      );
      setPreview(res.distributions);
      if (res.distributions.length === 0) {
        toast.info("לא נמצאו עובדי שירות עם משמרות בתאריך זה");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "חישוב החלוקה נכשל");
    } finally {
      setPreviewLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Save mutation
  // -----------------------------------------------------------------------
  const saveMut = useMutation({
    mutationFn: () =>
      recordTipPool({
        shiftDate,
        totalAgorot,
        locationId: locationId || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("חלוקת הטיפים נשמרה בהצלחה");
      setPreview(null);
      setTotalShekel("");
      setNote("");
      void qc.invalidateQueries({ queryKey: ["tips"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "שמירה נכשלה");
    },
  });

  // -----------------------------------------------------------------------
  // Delete mutation
  // -----------------------------------------------------------------------
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTipPool(id),
    onSuccess: () => {
      toast.success("רשומת הטיפים נמחקה");
      void qc.invalidateQueries({ queryKey: ["tips"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "מחיקה נכשלה");
    },
  });

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-8" dir="rtl">
      <div>
        <h1 className="text-xl font-semibold">חלוקת טיפים</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          בהתאם לחוק הטיפים 2022 (תיקון מס׳ 19 לחוק שכר מינימום) — הטיפים מחולקים לעובדי
          השירות שעבדו באותה משמרת, ביחס לשעות עבודתם.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Entry form                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card className="p-5 space-y-4">
        <h2 className="font-medium text-base">רישום טיפים יומי</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Date */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="shiftDate">
              תאריך משמרת
            </label>
            <input
              id="shiftDate"
              type="date"
              value={shiftDate}
              onChange={(e) => {
                setShiftDate(e.target.value);
                setPreview(null);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Location */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="locationId">
              סניף (אופציונלי)
            </label>
            <select
              id="locationId"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setPreview(null);
              }}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">כל הסניפים</option>
              {(locQuery.data ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor="totalShekel">
              סה״כ טיפים שנגבו (₪)
            </label>
            <div className="relative">
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                ₪
              </span>
              <input
                id="totalShekel"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={totalShekel}
                onChange={(e) => {
                  setTotalShekel(e.target.value);
                  setPreview(null);
                }}
                className="w-full rounded-md border border-input bg-background pe-3 ps-8 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label className="text-sm font-medium" htmlFor="tipNote">
              הערה (אופציונלי)
            </label>
            <input
              id="tipNote"
              type="text"
              placeholder="למשל: שישי בערב, אירוע פרטי..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => void handlePreview()}
          disabled={!totalAgorot || !shiftDate || previewLoading}
          className="w-full sm:w-auto"
        >
          {previewLoading ? "מחשב..." : "חשב חלוקה"}
        </Button>

        {/* ---------------------------------------------------------------- */}
        {/* Preview table                                                    */}
        {/* ---------------------------------------------------------------- */}
        {previewLoading && (
          <div className="space-y-2 pt-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}

        {preview && preview.length > 0 && (
          <div className="pt-2 space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              חלוקה מחושבת — {formatAgorot(totalAgorot)} בסה״כ
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="py-2 px-3 text-right font-medium">עובד/ת</th>
                    <th className="py-2 px-3 text-right font-medium">שעות עבודה</th>
                    <th className="py-2 px-3 text-right font-medium">חלק מהטיפים</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((d) => (
                    <tr key={d.employeeId} className="border-t">
                      <td className="py-2 px-3 font-medium">{d.employeeName}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {formatMinutes(d.shiftMinutes)}
                      </td>
                      <td className="py-2 px-3 font-semibold text-green-700 dark:text-green-400">
                        {formatAgorot(d.amountAgorot)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr>
                    <td className="py-2 px-3 font-medium" colSpan={2}>
                      סה״כ
                    </td>
                    <td className="py-2 px-3 font-semibold">
                      {formatAgorot(
                        preview.reduce((s, d) => s + d.amountAgorot, 0),
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="w-full sm:w-auto"
            >
              {saveMut.isPending ? "שומר..." : "שמור חלוקה"}
            </Button>
          </div>
        )}

        {preview && preview.length === 0 && !previewLoading && (
          <p className="text-sm text-muted-foreground pt-2">
            לא נמצאו עובדי שירות עם משמרות מאושרות בתאריך זה.
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* History                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-3">
        <h2 className="font-medium text-base">היסטוריית טיפים</h2>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">מתאריך</label>
            <input
              type="date"
              value={histStart}
              onChange={(e) => setHistStart(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">עד תאריך</label>
            <input
              type="date"
              value={histEnd}
              onChange={(e) => setHistEnd(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {histQuery.isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : histQuery.isError ? (
          <Card className="p-4 text-sm text-destructive">
            טעינת ההיסטוריה נכשלה.
          </Card>
        ) : (histQuery.data ?? []).length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            אין רשומות טיפים בתקופה זו.
          </Card>
        ) : (
          <div className="space-y-3">
            {(histQuery.data ?? []).map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                onDelete={(id) => deleteMut.mutate(id)}
                deleting={deleteMut.isPending && deleteMut.variables === pool.id}
              />
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        חוק הטיפים 2022 — טיפים המועברים על-ידי לקוחות שייכים לעובדי השירות בלבד.
        המעסיק מחויב לחלקם לפי שעות עבודה ולדווח בתלוש השכר.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PoolCard component
// ---------------------------------------------------------------------------

function PoolCard({
  pool,
  onDelete,
  deleting,
}: {
  pool: TipPoolItem;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">
            {formatDate(pool.shiftDate)}
            {pool.location && (
              <span className="mr-2 text-muted-foreground font-normal">
                — {pool.location.name}
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            סה״כ: <span className="font-semibold text-foreground">{formatAgorot(pool.totalAgorot)}</span>
            {" · "}
            {pool.distributions.length} עובדים
            {pool.note && <span> · {pool.note}</span>}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs"
          >
            {expanded ? "סגור" : "פרטים"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(pool.id)}
            disabled={deleting}
            className="text-xs text-destructive hover:text-destructive"
          >
            {deleting ? "מוחק..." : "מחק"}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto rounded border mt-1">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="py-1.5 px-2 text-right font-medium">עובד/ת</th>
                <th className="py-1.5 px-2 text-right font-medium">שעות</th>
                <th className="py-1.5 px-2 text-right font-medium">סכום</th>
              </tr>
            </thead>
            <tbody>
              {pool.distributions.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="py-1.5 px-2">{d.employee.fullName}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">
                    {formatMinutes(d.shiftMinutes)}
                  </td>
                  <td className="py-1.5 px-2 font-medium text-green-700 dark:text-green-400">
                    {formatAgorot(d.amountAgorot)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
