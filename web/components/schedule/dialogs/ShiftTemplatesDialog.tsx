"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coffee, Settings2, ShoppingBag, Sunrise } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  createShiftTemplate,
  listShiftTemplates,
  type ShiftTemplateInput,
} from "@/lib/api";
import { ShiftTemplatesEditor } from "@/components/settings/ShiftTemplatesEditor";

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShiftTemplatesDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [applyingPreset, setApplyingPreset] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const applyPreset = async (preset: Preset) => {
    if (preset.templates.length === 0) {
      toast.message("הוסף תבנית ידנית למטה.");
      return;
    }
    setApplyingPreset(preset.id);
    try {
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["shift-templates"] }),
        qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
      ]);
      setReloadToken((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת תבניות");
    } finally {
      setApplyingPreset(null);
    }
  };

  const onClose = (next: boolean) => {
    if (!next) {
      void qc.invalidateQueries({ queryKey: ["onboarding-progress"] });
      void qc.invalidateQueries({ queryKey: ["shift-templates"] });
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Sunrise className="h-5 w-5 text-amber-500" />
            צור תבניות משמרת
          </DialogTitle>
          <DialogDescription>
            בחר ערכה מוכנה או הגדר תבניות בהתאמה אישית.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pe-1">
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
        </div>

        <DialogFooter>
          <Button onClick={() => onClose(false)}>סיום</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
