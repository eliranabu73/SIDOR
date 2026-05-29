"use client";

import { CalendarPlus, Sparkles, Utensils, ShoppingBag, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyScheduleStateProps = {
  onCreateFirstShift: () => void;
  onAutoSchedule: () => void;
  /**
   * Optional — open the create-shift dialog with a template name pre-selected.
   * The dialog matches by template name (case-insensitive) and falls back to
   * "no template" if no template with that name exists.
   */
  onCreateFromPreset?: (presetName: string) => void;
};

const PRESETS: { id: string; label: string; icon: React.ReactNode; templateName: string }[] = [
  {
    id: "restaurant",
    label: "תבנית מסעדה",
    icon: <Utensils className="h-4 w-4" />,
    templateName: "משמרת ערב",
  },
  {
    id: "store",
    label: "תבנית חנות",
    icon: <ShoppingBag className="h-4 w-4" />,
    templateName: "משמרת בוקר",
  },
  {
    id: "custom",
    label: "מותאם",
    icon: <Settings2 className="h-4 w-4" />,
    templateName: "",
  },
];

export function EmptyScheduleState({
  onCreateFirstShift,
  onAutoSchedule,
  onCreateFromPreset,
}: EmptyScheduleStateProps) {
  const handlePreset = (templateName: string) => {
    if (onCreateFromPreset) {
      onCreateFromPreset(templateName);
    } else {
      onCreateFirstShift();
    }
  };

  return (
    <div className="flex w-full items-center justify-center px-4 sm:px-6 py-12 sm:py-16">
      <div className="mesh-bg relative w-full max-w-md overflow-hidden rounded-3xl border border-border p-1">
        <div className="relative rounded-[1.4rem] bg-card/80 p-6 sm:p-8 text-center backdrop-blur-md">
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
            עדיין אין משמרות בשבוע הזה — התחל מתבנית או צור משמרת חדשה.
          </p>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              size="lg"
              variant="glow"
              onClick={onCreateFirstShift}
              className="w-full text-base"
            >
              <CalendarPlus className="h-5 w-5" />
              צור משמרת ראשונה
            </Button>

            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handlePreset(p.templateName)}
                  className="h-auto flex-col gap-1 py-3"
                  aria-label={p.label}
                >
                  {p.icon}
                  <span className="text-xs">{p.label}</span>
                </Button>
              ))}
            </div>

            <Button
              type="button"
              size="lg"
              variant="ghost"
              onClick={onAutoSchedule}
              className="w-full"
            >
              <Sparkles className="h-4 w-4" />
              שיבוץ אוטומטי לשבוע שלם
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
