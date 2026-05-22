"use client";

import { CalendarPlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyScheduleStateProps = {
  onCreateFirstShift: () => void;
};

export function EmptyScheduleState({
  onCreateFirstShift,
}: EmptyScheduleStateProps) {
  return (
    <div className="flex w-full items-center justify-center px-6 py-16">
      <div className="mesh-bg relative w-full max-w-md overflow-hidden rounded-3xl border border-border p-1">
        <div className="relative rounded-[1.4rem] bg-card/80 p-8 text-center backdrop-blur-md">
          <div
            aria-hidden
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 p-[2px]"
          >
            <div className="flex h-full w-full items-center justify-center rounded-full bg-card">
              <CalendarPlus className="h-9 w-9 text-indigo-500" />
            </div>
          </div>

          <h2 className="mt-5 text-xl font-bold text-foreground">
            הסידור שלך מוכן להתחיל
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            עדיין אין משמרות בשבוע הזה
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              variant="glow"
              onClick={onCreateFirstShift}
              className="w-full"
            >
              <Sparkles className="h-4 w-4" />
              צור שבוע לדוגמה
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onCreateFirstShift}
              className="w-full"
            >
              + צור משמרת ראשונה
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
