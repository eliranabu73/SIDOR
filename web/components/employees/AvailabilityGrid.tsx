"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  fetchEmployeeAvailability,
  saveEmployeeAvailability,
  type ManagerAvailabilityRule,
  type ManagerAvailabilityType,
} from "@/lib/api";

interface Props {
  employeeId: string;
}

const DAY_LABELS = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

// 30-minute slots → 48 cells per day
const SLOTS_PER_DAY = 48;
const DAYS = 7;
type Mode = "AVAILABLE" | "UNAVAILABLE" | "PREFERRED" | "CLEAR";

const MODE_LABEL: Record<Mode, string> = {
  AVAILABLE: "זמין",
  UNAVAILABLE: "לא זמין",
  PREFERRED: "מועדף",
  CLEAR: "נקה",
};

const MODE_BTN_CLASS: Record<Mode, string> = {
  AVAILABLE:
    "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-500/40 dark:text-emerald-300",
  UNAVAILABLE:
    "bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 border-rose-500/40 dark:text-rose-300",
  PREFERRED:
    "bg-indigo-500/15 text-indigo-700 hover:bg-indigo-500/25 border-indigo-500/40 dark:text-indigo-300",
  CLEAR:
    "bg-muted text-muted-foreground hover:bg-muted/80 border-border",
};

const CELL_COLOR: Record<Exclude<Mode, "CLEAR">, string> = {
  AVAILABLE: "bg-emerald-500/70 hover:bg-emerald-500/80",
  UNAVAILABLE: "bg-rose-500/70 hover:bg-rose-500/80",
  PREFERRED: "bg-indigo-500/70 hover:bg-indigo-500/80",
};

type GridState = (ManagerAvailabilityType | null)[][];

function emptyGrid(): GridState {
  return Array.from({ length: DAYS }, () =>
    Array.from({ length: SLOTS_PER_DAY }, () => null),
  );
}

function parseTimeToSlot(hhmm: string): number {
  // "HH:mm" or "HH:mm:ss" -> slot index (0..48). End time 24:00:00 -> 48.
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr) || 0;
  const m = Number(mStr) || 0;
  return h * 2 + (m >= 30 ? 1 : 0);
}

function slotToTime(slot: number): string {
  const h = Math.floor(slot / 2);
  const m = (slot % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function rulesToGrid(rules: ManagerAvailabilityRule[]): GridState {
  const g = emptyGrid();
  for (const r of rules) {
    const start = parseTimeToSlot(r.startLocalTime);
    const endRaw = parseTimeToSlot(r.endLocalTime);
    // endLocalTime "24:00:00" or wrap → cap at SLOTS_PER_DAY
    const end =
      r.endLocalTime.startsWith("24") || endRaw === 0 ? SLOTS_PER_DAY : endRaw;
    const day = g[r.dayOfWeek];
    if (!day) continue;
    for (let i = start; i < end && i < SLOTS_PER_DAY; i++) {
      day[i] = r.availabilityType;
    }
  }
  return g;
}

function gridToRules(
  grid: GridState,
): Array<{
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  availabilityType: ManagerAvailabilityType;
}> {
  const out: Array<{
    dayOfWeek: number;
    startLocalTime: string;
    endLocalTime: string;
    availabilityType: ManagerAvailabilityType;
  }> = [];
  for (let d = 0; d < DAYS; d++) {
    const day = grid[d];
    if (!day) continue;
    let i = 0;
    while (i < SLOTS_PER_DAY) {
      const cur = day[i];
      if (!cur) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < SLOTS_PER_DAY && day[j] === cur) j++;
      const endTime = j === SLOTS_PER_DAY ? "24:00:00" : slotToTime(j);
      out.push({
        dayOfWeek: d,
        startLocalTime: slotToTime(i),
        endLocalTime: endTime,
        availabilityType: cur,
      });
      i = j;
    }
  }
  return out;
}

export function AvailabilityGrid({ employeeId }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["employee-availability", employeeId],
    queryFn: () => fetchEmployeeAvailability(employeeId),
  });

  const [mode, setMode] = React.useState<Mode>("AVAILABLE");
  const [grid, setGrid] = React.useState<GridState>(emptyGrid);
  const paintingRef = React.useRef<boolean>(false);
  const initialized = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (query.data && !initialized.current) {
      setGrid(rulesToGrid(query.data.rules));
      initialized.current = true;
    }
  }, [query.data]);

  const paintCell = React.useCallback(
    (day: number, slot: number) => {
      setGrid((prev) => {
        const next = prev.map((row) => row.slice());
        const target = next[day];
        if (!target) return prev;
        target[slot] = mode === "CLEAR" ? null : mode;
        return next;
      });
    },
    [mode],
  );

  const saveMut = useMutation({
    mutationFn: () => saveEmployeeAvailability(employeeId, gridToRules(grid)),
    onSuccess: () => {
      toast.success("הזמינות נשמרה");
      qc.invalidateQueries({ queryKey: ["employee-availability", employeeId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    },
  });

  if (query.isLoading) {
    return <Skeleton className="h-72 w-full" />;
  }
  if (query.isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        טעינת הזמינות נכשלה.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["PREFERRED", "AVAILABLE", "UNAVAILABLE", "CLEAR"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-medium transition",
              MODE_BTN_CLASS[m],
              mode === m && "ring-2 ring-offset-1 ring-foreground/40",
            )}
            aria-pressed={mode === m}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
        <div className="ms-auto">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? "שומר…" : "שמור שינויים"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        טיפ: לחצו וגררו על המסך כדי לצבוע מספר תאים בו־זמנית. כל תא מייצג חצי
        שעה. תא ריק = ברירת מחדל (זמין לפי חוק).
      </p>

      <div
        className="overflow-x-auto rounded-lg border bg-card"
        onMouseLeave={() => {
          paintingRef.current = false;
        }}
        onMouseUp={() => {
          paintingRef.current = false;
        }}
      >
        <div
          className="grid select-none"
          style={{
            gridTemplateColumns: `60px repeat(${SLOTS_PER_DAY}, minmax(10px, 1fr))`,
            minWidth: 720,
          }}
        >
          {/* header row: hours 0..23 spanning 2 cols each */}
          <div className="bg-muted/50 p-1 text-xs" />
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={`h-${h}`}
              className="col-span-2 border-s border-border/60 bg-muted/50 px-1 py-1 text-center text-[10px] text-muted-foreground"
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
          {/* day rows */}
          {DAY_LABELS.map((label, d) => (
            <React.Fragment key={`d-${d}`}>
              <div className="flex items-center justify-center border-t bg-muted/30 px-1 py-1 text-xs font-medium">
                {label}
              </div>
              {Array.from({ length: SLOTS_PER_DAY }).map((_, s) => {
                const val = grid[d]?.[s] ?? null;
                const cellClass = val
                  ? CELL_COLOR[val]
                  : "bg-background hover:bg-muted/60";
                return (
                  <button
                    key={`c-${d}-${s}`}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      paintingRef.current = true;
                      paintCell(d, s);
                    }}
                    onMouseEnter={() => {
                      if (paintingRef.current) paintCell(d, s);
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      paintCell(d, s);
                    }}
                    className={cn(
                      "h-7 border-t border-s border-border/40 transition-colors",
                      s % 2 === 0 && "border-s-border/70",
                      cellClass,
                    )}
                    aria-label={`יום ${label} שעה ${slotToTime(s).slice(0, 5)}`}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
