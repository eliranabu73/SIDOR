"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** "HH:mm" 24-hour string, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Minute step for the minutes list. Defaults to 15. */
  minuteStep?: number;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Friendly 24-hour time picker rendered as two HH / MM dropdowns showing the
 * value as "14:00". Replaces the native <input type="time"> whose platform
 * spinner shows bare, hard-to-read numbers. RTL-aware, keyboard accessible,
 * large touch targets. Reads/writes the same "HH:mm" string contract.
 */
export function TimeSelect({
  value,
  onChange,
  minuteStep = 15,
  id,
  className,
  ...rest
}: Props) {
  const [hh, mm] = value && value.includes(":") ? value.split(":") : ["", ""];

  const hours = React.useMemo(
    () => Array.from({ length: 24 }, (_, i) => pad(i)),
    [],
  );
  const minutes = React.useMemo(
    () =>
      Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) =>
        pad(i * minuteStep),
      ),
    [minuteStep],
  );

  const commit = (nextHH: string, nextMM: string) => {
    if (!nextHH && !nextMM) {
      onChange("");
      return;
    }
    onChange(`${nextHH || "00"}:${nextMM || "00"}`);
  };

  const selectClass =
    "h-11 sm:h-10 rounded-md border border-input bg-background px-2 text-base sm:text-sm tabular-nums text-center shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <div
      dir="ltr"
      className={cn("flex items-center gap-1.5", className)}
      aria-label={rest["aria-label"]}
    >
      <Clock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
      <select
        id={id}
        value={hh}
        onChange={(e) => commit(e.target.value, mm || "00")}
        className={selectClass}
        aria-label="שעה"
      >
        <option value="" disabled>
          --
        </option>
        {hours.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="font-semibold text-muted-foreground">:</span>
      <select
        value={mm}
        onChange={(e) => commit(hh || "00", e.target.value)}
        className={selectClass}
        aria-label="דקות"
      >
        <option value="" disabled>
          --
        </option>
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
