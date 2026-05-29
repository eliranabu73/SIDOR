"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  createEmployee,
  fetchLocations,
  fetchRoles,
  type LocationItem,
  type RoleItem,
} from "@/lib/api";

interface Row {
  id: string;
  fullName: string;
  roleId: string;
  hourlyRate: string;
  hireDate: string;
  weeklyBudgetHours: string;
}

const emptyRow = (): Row => ({
  id: `row_${Math.random().toString(36).slice(2)}`,
  fullName: "",
  roleId: "",
  hourlyRate: "",
  hireDate: "",
  weeklyBudgetHours: "",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAddEmployeesDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = React.useState<Row[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
  const [roles, setRoles] = React.useState<RoleItem[]>([]);
  const [locations, setLocations] = React.useState<LocationItem[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    void Promise.all([fetchRoles(), fetchLocations()])
      .then(([r, l]) => {
        setRoles(r);
        setLocations(l);
      })
      .catch(() => {
        /* ignored */
      });
  }, [open]);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const remove = (id: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const validRows = rows.filter(
    (r) =>
      r.fullName.trim().length >= 2 && Number.parseFloat(r.hourlyRate || "0") >= 1,
  );

  const canSave = validRows.length >= 1 && !saving;

  const onSave = async () => {
    setSaving(true);
    setProgress({ done: 0, total: validRows.length });
    let success = 0;
    try {
      for (const r of validRows) {
        try {
          await createEmployee({
            fullName: r.fullName.trim(),
            roleIds: r.roleId ? [r.roleId] : undefined,
            defaultLocationId: locations[0]?.id,
            hourlyRate: Number.parseFloat(r.hourlyRate),
            hireDate: r.hireDate || undefined,
            weeklyBudgetHours: r.weeklyBudgetHours
              ? Number.parseInt(r.weeklyBudgetHours, 10)
              : undefined,
          });
          success += 1;
          setProgress({ done: success, total: validRows.length });
        } catch (err) {
          toast.error(
            `שגיאה ביצירת ${r.fullName}: ${
              err instanceof Error ? err.message : "לא ידוע"
            }`,
          );
        }
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employees"] }),
        qc.invalidateQueries({ queryKey: ["employees-summary"] }),
        qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
      ]);
      if (success > 0) {
        toast.success(`נוספו ${success} עובדים`);
        onOpenChange(false);
        setRows([emptyRow(), emptyRow(), emptyRow()]);
      }
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-emerald-500" />
            הוסף עובדים
          </DialogTitle>
          <DialogDescription>
            הוסף לפחות 3 עובדים כדי לאפשר שיבוץ אוטומטי. אפשר להוסיף עוד פרטים מאוחר יותר.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pe-1">
          {rows.map((r, idx) => (
            <div
              key={r.id}
              className="rounded-md border bg-muted/20 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  עובד #{idx + 1}
                </span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    aria-label="הסר עובד"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">שם מלא</Label>
                  <Input
                    value={r.fullName}
                    onChange={(e) => update(r.id, { fullName: e.target.value })}
                    placeholder="שם פרטי ומשפחה"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">תפקיד</Label>
                  <select
                    value={r.roleId}
                    onChange={(e) => update(r.id, { roleId: e.target.value })}
                    className="w-full h-10 rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">— ללא —</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">שכר שעתי (₪)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min={1}
                    value={r.hourlyRate}
                    onChange={(e) => update(r.id, { hourlyRate: e.target.value })}
                    placeholder="40"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">תאריך תחילת עבודה</Label>
                  <Input
                    type="date"
                    value={r.hireDate}
                    onChange={(e) => update(r.id, { hireDate: e.target.value })}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">תקציב שעות שבועי (אופציונלי)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={80}
                    value={r.weeklyBudgetHours}
                    onChange={(e) =>
                      update(r.id, { weeklyBudgetHours: e.target.value })
                    }
                    placeholder="40"
                    className="h-10"
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="w-full"
          >
            <Plus className="h-4 w-4" />
            הוסף שורה נוספת
          </Button>
        </div>

        {progress && (
          <div className="text-xs text-muted-foreground tabular-nums">
            נוצרים: {progress.done} / {progress.total}…
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            {saving ? "שומר…" : `שמור ${validRows.length} עובדים`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
