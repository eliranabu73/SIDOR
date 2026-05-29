"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Coins, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateEmployee } from "@/lib/api";
import type { Employee } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
}

export function EmployeeRateMatrixDialog({ open, onOpenChange, employees }: Props) {
  const qc = useQueryClient();
  const needRate = React.useMemo(
    () => employees.filter((e) => !e.hourlyRate || e.hourlyRate === 0),
    [employees],
  );
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) {
      setDrafts({});
      setSavedIds(new Set());
    }
  }, [open]);

  const save = async (emp: Employee) => {
    const raw = drafts[emp.id];
    const rate = Number.parseFloat(raw ?? "");
    if (!Number.isFinite(rate) || rate < 1) {
      toast.error("שכר שעתי חייב להיות 1 ומעלה");
      return;
    }
    setSavingId(emp.id);
    try {
      await updateEmployee(emp.id, { hourlyRate: rate });
      setSavedIds((prev) => new Set(prev).add(emp.id));
      toast.success(`עודכן: ${emp.fullName}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employees"] }),
        qc.invalidateQueries({ queryKey: ["employees-summary"] }),
        qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שמירה נכשלה");
    } finally {
      setSavingId(null);
    }
  };

  const remaining = needRate.filter((e) => !savedIds.has(e.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-500" />
            הזן שכר לכל עובד
          </DialogTitle>
          <DialogDescription>
            {needRate.length === 0
              ? "כל העובדים כבר עם שכר שעתי מוגדר."
              : `${remaining} עובדים ללא שכר. הזן את התעריף וכפתור שמירה לכל שורה.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pe-1">
          {needRate.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              אין עובדים שדורשים הזנת שכר.
            </p>
          ) : (
            needRate.map((emp) => {
              const saved = savedIds.has(emp.id);
              return (
                <div
                  key={emp.id}
                  className={`flex items-center gap-2 rounded-md border p-2 ${
                    saved ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-muted/20"
                  }`}
                >
                  <div className="flex-1 min-w-0 truncate font-medium text-sm">
                    {emp.fullName}
                  </div>
                  <Input
                    type="number"
                    step="0.5"
                    min={1}
                    max={500}
                    placeholder="₪/שעה"
                    value={drafts[emp.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [emp.id]: e.target.value }))
                    }
                    disabled={saved}
                    className="h-10 w-24"
                  />
                  {saved ? (
                    <span className="inline-flex h-10 w-10 items-center justify-center text-emerald-600">
                      <Check className="h-5 w-5" />
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => save(emp)}
                      disabled={savingId === emp.id || !drafts[emp.id]}
                      className="h-10"
                    >
                      {savingId === emp.id ? "…" : "שמור"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>סיום</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
