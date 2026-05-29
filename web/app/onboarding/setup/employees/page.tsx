"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createEmployee,
  fetchRoles,
  type RoleItem,
} from "@/lib/api";
import { useOnboardingProgress } from "@/lib/onboarding-progress";
import { useWizardNav } from "../layout";

interface EmployeeDraft {
  id: string;
  fullName: string;
  roleId: string;
  // Note: hourlyRate / hireDate / weeklyBudgetHours are part of Phase 1 of the
  // plan and require backend schema changes (Employee.hireDate column,
  // CreateEmployeeBody widening). Until that lands the wizard captures the
  // values locally and we only POST the fields the backend currently accepts.
  hourlyRate: string;
  hireDate: string;
  weeklyBudgetHours: string;
}

function emptyDraft(): EmployeeDraft {
  return {
    id: crypto.randomUUID(),
    fullName: "",
    roleId: "",
    hourlyRate: "",
    hireDate: "",
    weeklyBudgetHours: "",
  };
}

export default function EmployeesStepPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const progress = useOnboardingProgress();

  const [roles, setRoles] = React.useState<RoleItem[]>([]);
  const [drafts, setDrafts] = React.useState<EmployeeDraft[]>([emptyDraft()]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchRoles();
        if (!cancelled) {
          setRoles(list);
          // Pre-select first role on the empty seed row.
          if (list.length > 0) {
            setDrafts((prev) =>
              prev.map((d) => (d.roleId ? d : { ...d, roleId: list[0]!.id })),
            );
          }
        }
      } catch {
        /* roles fetch failed — render with no preset; still allow free entry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const existingCount = progress.employees?.length ?? 0;
  const filledDrafts = drafts.filter((d) => d.fullName.trim().length >= 2);

  // Allowed to advance if at least 1 employee exists (existing OR a filled draft).
  const canAdvance = existingCount + filledDrafts.length >= 1 && !saving;

  const onNext = React.useCallback(async () => {
    setSaving(true);
    try {
      for (const d of filledDrafts) {
        const rate = parseFloat(d.hourlyRate);
        const budget = parseInt(d.weeklyBudgetHours, 10);
        await createEmployee({
          fullName: d.fullName.trim(),
          roleIds: d.roleId ? [d.roleId] : undefined,
          hourlyRate: Number.isFinite(rate) && rate > 0 ? rate : 0,
          hireDate: d.hireDate || null,
          weeklyBudgetHours: Number.isFinite(budget) && budget > 0 ? budget : null,
        });
      }
      await qc.invalidateQueries({ queryKey: ["onboarding-progress"] });
      await qc.invalidateQueries({ queryKey: ["employees"] });
      router.push("/onboarding/setup/shifts");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "הוספת עובדים נכשלה";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [filledDrafts, qc, router]);

  useWizardNav({
    canAdvance,
    onNext,
    nextLabel: saving ? "שומר…" : "הבא",
  });

  const updateDraft = (id: string, patch: Partial<EmployeeDraft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const addRow = () => setDrafts((prev) => [...prev, emptyDraft()]);
  const removeRow = (id: string) =>
    setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((d) => d.id !== id)));

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">עובדים</h1>
          <p className="text-sm text-muted-foreground">
            הזן לפחות עובד אחד כדי שנוכל לשבץ אותו במשמרות.
          </p>
        </div>
      </header>

      {existingCount > 0 && (
        <div className="rounded-md border border-indigo-200 bg-indigo-500/5 px-3 py-2 text-sm text-foreground dark:border-indigo-900">
          כבר הוספת {existingCount} עובד{existingCount === 1 ? "" : "ים"} לארגון. אפשר להוסיף עוד או לעבור לשלב הבא.
        </div>
      )}

      <div className="space-y-3">
        {drafts.map((d, idx) => (
          <div
            key={d.id}
            className="rounded-md border bg-card/40 p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                עובד {idx + 1}
              </span>
              {drafts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(d.id)}
                  aria-label="הסר עובד"
                  className="rounded p-1 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`name-${d.id}`}>שם מלא</Label>
              <Input
                id={`name-${d.id}`}
                value={d.fullName}
                onChange={(e) => updateDraft(d.id, { fullName: e.target.value })}
                placeholder="לדוגמה: יעל כהן"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`role-${d.id}`}>תפקיד</Label>
                <select
                  id={`role-${d.id}`}
                  value={d.roleId}
                  onChange={(e) => updateDraft(d.id, { roleId: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
                >
                  <option value="">— ללא תפקיד —</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`rate-${d.id}`}>שכר לשעה (₪)</Label>
                <Input
                  id={`rate-${d.id}`}
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={d.hourlyRate}
                  onChange={(e) =>
                    updateDraft(d.id, { hourlyRate: e.target.value })
                  }
                  placeholder="32.30"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`hire-${d.id}`}>תאריך התחלה</Label>
                <Input
                  id={`hire-${d.id}`}
                  type="date"
                  value={d.hireDate}
                  onChange={(e) => updateDraft(d.id, { hireDate: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`budget-${d.id}`}>שעות שבועיות מקסימום</Label>
                <Input
                  id={`budget-${d.id}`}
                  type="number"
                  min={0}
                  max={60}
                  inputMode="numeric"
                  value={d.weeklyBudgetHours}
                  onChange={(e) =>
                    updateDraft(d.id, { weeklyBudgetHours: e.target.value })
                  }
                  placeholder="42"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        className="w-full"
      >
        <Plus className="me-1 h-4 w-4" />
        הוסף עובד
      </Button>

      <p className="text-xs text-muted-foreground">
        תוכל לערוך פרטים נוספים — שכר, ותק, זמינות והעדפות — מתוך עמוד העובדים אחרי האשף.
      </p>
    </div>
  );
}
