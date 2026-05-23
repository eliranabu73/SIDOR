"use client";

import { CalendarRange, Plus, ClipboardList, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Empty state for a week with zero shifts.
 *
 * Co-designed with ChatGPT (Q4, 2026-05-21):
 *   - No illustration. SaaS תפעולי ≠ consumer product.
 *   - Calendar+Grid outline icon at 40% opacity. That's all the decoration.
 *   - Two primary CTAs (first-shift / from-template) + secondary import link.
 */
interface Props {
  onCreateFirst: () => void;
  onCreateFromTemplate: () => void;
  onImport?: () => void;
}

export function EmptyScheduleState({
  onCreateFirst,
  onCreateFromTemplate,
  onImport,
}: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-96 text-center px-6 py-12 gap-4"
      role="status"
      aria-label="אין משמרות בשבוע זה"
    >
      <CalendarRange className="h-12 w-12 opacity-40" aria-hidden />
      <div>
        <p className="text-base font-medium mb-1">אין עדיין משמרות בשבוע הזה</p>
        <p className="text-sm text-muted-foreground max-w-md">
          אפשר להתחיל ממשמרת ראשונה או ליצור סידור מתוך תבנית קיימת.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
        <Button onClick={onCreateFirst}>
          <Plus className="h-4 w-4" />
          משמרת ראשונה
        </Button>
        <Button variant="outline" onClick={onCreateFromTemplate}>
          <ClipboardList className="h-4 w-4" />
          צור מתבנית
        </Button>
      </div>
      {onImport && (
        <button
          type="button"
          onClick={onImport}
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          ייבוא מאקסל
        </button>
      )}
    </div>
  );
}
