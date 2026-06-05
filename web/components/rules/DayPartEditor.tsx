"use client";

import * as React from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSelect } from "@/components/ui/TimeSelect";
import type { DayPart } from "@/lib/rules-mapping";

type Props = {
  dayParts: DayPart[];
  onChange: (next: DayPart[]) => void;
};

let _seq = 0;
function newId(): string {
  _seq += 1;
  return `dp-${Date.now().toString(36)}-${_seq}`;
}

/**
 * Edits the list of "day-parts" — בוקר / ערב / לילה ... — each with a time
 * window and a headcount ("how many people"). Pure controlled component: it owns
 * no server state, only renders the given list and reports edits up.
 */
export function DayPartEditor({ dayParts, onChange }: Props) {
  const update = (id: string, patch: Partial<DayPart>) =>
    onChange(dayParts.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const remove = (id: string) => onChange(dayParts.filter((d) => d.id !== id));

  const add = () =>
    onChange([
      ...dayParts,
      { id: newId(), name: "חלק יום", start: "09:00", end: "17:00", headcount: 1 },
    ]);

  return (
    <div className="space-y-3">
      {dayParts.map((dp) => {
        const invalidWindow =
          dp.start !== "" && dp.end !== "" && dp.start >= dp.end;
        return (
          <div
            key={dp.id}
            className="rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            <div className="flex flex-wrap items-end gap-3">
              {/* Name */}
              <div className="min-w-[8rem] flex-1 space-y-1">
                <Label htmlFor={`name-${dp.id}`} className="text-xs">
                  שם החלק
                </Label>
                <Input
                  id={`name-${dp.id}`}
                  value={dp.name}
                  onChange={(e) => update(dp.id, { name: e.target.value })}
                  placeholder="בוקר / ערב…"
                />
              </div>

              {/* From */}
              <div className="space-y-1">
                <Label className="text-xs">משעה</Label>
                <TimeSelect
                  value={dp.start}
                  onChange={(v) => update(dp.id, { start: v })}
                  aria-label={`${dp.name} — שעת התחלה`}
                />
              </div>

              {/* To */}
              <div className="space-y-1">
                <Label className="text-xs">עד שעה</Label>
                <TimeSelect
                  value={dp.end}
                  onChange={(v) => update(dp.id, { end: v })}
                  aria-label={`${dp.name} — שעת סיום`}
                />
              </div>

              {/* Headcount */}
              <div className="w-24 space-y-1">
                <Label htmlFor={`hc-${dp.id}`} className="flex items-center gap-1 text-xs">
                  <Users className="h-3.5 w-3.5" />
                  כמה אנשים
                </Label>
                <Input
                  id={`hc-${dp.id}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={dp.headcount}
                  onChange={(e) =>
                    update(dp.id, {
                      headcount: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                    })
                  }
                  className="text-center tabular-nums"
                />
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => remove(dp.id)}
                aria-label={`מחק ${dp.name}`}
                disabled={dayParts.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {invalidWindow && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                שעת הסיום חייבת להיות אחרי שעת ההתחלה.
              </p>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={add}>
        <Plus className="h-4 w-4" />
        הוסף חלק יום
      </Button>
    </div>
  );
}
