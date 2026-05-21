"use client";

import { DateTime } from "luxon";
import { ChevronRight, ChevronLeft, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  weekStart: DateTime;
  onChange: (next: DateTime) => void;
}

export function WeekSelector({ weekStart, onChange }: Props) {
  const end = weekStart.plus({ days: 6 });
  return (
    <div className="inline-flex items-center gap-1 rounded-md border bg-card p-1">
      {/* In RTL, ChevronRight visually points to the "previous" direction. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(weekStart.plus({ weeks: 1 }))}
        aria-label="שבוע הבא"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="px-2 text-sm font-medium tabular-nums whitespace-nowrap flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        {weekStart.toFormat("d.M")} – {end.toFormat("d.M.yyyy")}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onChange(weekStart.minus({ weeks: 1 }))}
        aria-label="שבוע קודם"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onChange(weekStart.startOf("week").minus({ days: weekStart.weekday % 7 }))}
      >
        היום
      </Button>
    </div>
  );
}

export function startOfWeekSunday(d: DateTime): DateTime {
  const w = d.weekday % 7; // Sunday => 0
  return d.startOf("day").minus({ days: w });
}
