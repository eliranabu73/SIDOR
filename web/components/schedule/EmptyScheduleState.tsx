"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type EmptyScheduleStateProps = {
  onCreateFirstShift: () => void;
};

export function EmptyScheduleState({
  onCreateFirstShift,
}: EmptyScheduleStateProps) {
  return (
    <div className="flex w-full items-center justify-center px-6 py-16">
      <Card className="w-full max-w-md bg-card text-center">
        <CardContent className="flex flex-col items-center gap-5 p-8">
          <div
            aria-hidden
            className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-background"
          >
            <CalendarPlus className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-foreground">
              הסידור שלך מוכן להתחיל
            </h2>
            <p className="text-sm text-muted-foreground">
              עדיין אין משמרות בשבוע הזה
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 pt-1">
            <Button
              type="button"
              size="lg"
              onClick={onCreateFirstShift}
              className="w-full"
            >
              + צור משמרת ראשונה
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={onCreateFirstShift}
              className="w-full"
            >
              ✨ צור שבוע לדוגמה
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
