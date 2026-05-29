"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coffee, Settings2, ShoppingBag, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createShiftTemplate,
  listShiftTemplates,
  type ShiftTemplateInput,
} from "@/lib/api";
import { ShiftTemplatesEditor } from "@/components/settings/ShiftTemplatesEditor";
import { useOnboardingProgress } from "@/lib/onboarding-progress";
import { useWizardNav } from "../layout";

interface Preset {
  id: "restaurant" | "retail" | "custom";
  label: string;
  description: string;
  icon: React.ReactNode;
  templates: ShiftTemplateInput[];
}

const PRESETS: Preset[] = [
  {
    id: "restaurant",
    label: "מסעדה",
    description: "בוקר • צהריים • ערב",
    icon: <Coffee className="h-5 w-5" />,
    templates: [
      { name: "בוקר", startLocalTime: "09:00", endLocalTime: "15:00", requiredEmployeeCount: 2 },
      { name: "צהריים", startLocalTime: "12:00", endLocalTime: "18:00", requiredEmployeeCount: 2 },
      { name: "ערב", startLocalTime: "17:00", endLocalTime: "23:00", requiredEmployeeCount: 2 },
    ],
  },
  {
    id: "retail",
    label: "חנות",
    description: "משמרת אחת ארוכה",
    icon: <ShoppingBag className="h-5 w-5" />,
    templates: [
      { name: "משמרת מלאה", startLocalTime: "09:00", endLocalTime: "19:00", requiredEmployeeCount: 1 },
    ],
  },
  {
    id: "custom",
    label: "מותאם",
    description: "תבנה בעצמך",
    icon: <Settings2 className="h-5 w-5" />,
    templates: [],
  },
];

export default function ShiftsStepPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const progress = useOnboardingProgress();

  const [applyingPreset, setApplyingPreset] = React.useState<string | null>(null);
  // Bump this to force ShiftTemplatesEditor to reload after a preset apply.
  const [reloadToken, setReloadToken] = React.useState(0);

  const existingCount = progress.shiftTemplates?.length ?? 0;
  const canAdvance = existingCount >= 1;

  const onNext = React.useCallback(() => {
    router.push("/onboarding/setup/review");
  }, [router]);

  useWizardNav({ canAdvance, onNext });

  const applyPreset = async (preset: Preset) => {
    if (preset.templates.length === 0) {
      // "מותאם" — nothing to apply, just scroll the editor into view.
      toast.message("הוסף תבנית ידנית למטה.");
      return;
    }
    setApplyingPreset(preset.id);
    try {
      // Avoid creating duplicates if user already applied a preset with the
      // same name — fetch existing names, skip overlaps.
      const existing = await listShiftTemplates();
      const existingNames = new Set(existing.map((t) => t.name));
      let created = 0;
      for (const tpl of preset.templates) {
        if (existingNames.has(tpl.name)) continue;
        await createShiftTemplate(tpl);
        created += 1;
      }
      if (created === 0) {
        toast.message("התבניות של הערכה הזו כבר קיימות.");
      } else {
        toast.success(`נוצרו ${created} תבניות`);
      }
      await qc.invalidateQueries({ queryKey: ["onboarding-progress"] });
      setReloadToken((n) => n + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה ביצירת תבניות";
      toast.error(msg);
    } finally {
      setApplyingPreset(null);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Sunrise className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">תבניות משמרת</h1>
          <p className="text-sm text-muted-foreground">
            בחר ערכה מוכנה או הגדר משמרות בהתאמה אישית — תוכל לערוך הכל אחרי האשף.
          </p>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p)}
            disabled={applyingPreset === p.id}
            className="flex flex-col items-start gap-1 rounded-lg border bg-card/50 p-3 text-right transition-all hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-sm disabled:opacity-60"
          >
            <div className="text-indigo-600 dark:text-indigo-400">{p.icon}</div>
            <div className="font-medium">{p.label}</div>
            <div className="text-xs text-muted-foreground">{p.description}</div>
            {applyingPreset === p.id && (
              <span className="text-xs text-muted-foreground">מחיל…</span>
            )}
          </button>
        ))}
      </div>

      <div key={reloadToken}>
        <ShiftTemplatesEditor />
      </div>

      {existingCount === 0 && (
        <p className="text-xs text-muted-foreground">
          הוסף לפחות תבנית אחת כדי להמשיך לשלב הסקירה.
        </p>
      )}

      <div className="border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={onNext}
          disabled={!canAdvance}
        >
          המשך לסקירה
        </Button>
      </div>
    </div>
  );
}
