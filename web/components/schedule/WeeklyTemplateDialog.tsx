"use client";

import * as React from "react";
import { Plus, Trash2, CalendarCog, Wand2 } from "lucide-react";
import { toast } from "sonner";
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
import { TimeSelect } from "@/components/ui/TimeSelect";
import {
  useWeeklyTemplates,
  useCreateWeeklyTemplate,
  useUpdateWeeklyTemplate,
  useDeleteWeeklyTemplate,
  useApplyWeeklyTemplate,
  useEmployees,
  useRoles,
} from "@/lib/queries";
import type { WeeklyTemplate, WeeklyTemplateInput } from "@/lib/api";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface RowState {
  dayOfWeek: number;
  startLocalTime: string; // "HH:mm"
  endLocalTime: string;
  roleId: string | null;
  requiredEmployeeCount: number;
  defaultEmployeeIds: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When present, the user can apply the chosen template to this week. */
  scheduleId: string | null;
}

const blankRow = (): RowState => ({
  dayOfWeek: 0,
  startLocalTime: "09:00",
  endLocalTime: "17:00",
  roleId: null,
  requiredEmployeeCount: 1,
  defaultEmployeeIds: [],
});

function toRows(t: WeeklyTemplate): RowState[] {
  return t.shifts.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    startLocalTime: s.startLocalTime.slice(0, 5),
    endLocalTime: s.endLocalTime.slice(0, 5),
    roleId: s.roleId,
    requiredEmployeeCount: s.requiredEmployeeCount,
    defaultEmployeeIds: s.defaultEmployeeIds,
  }));
}

export function WeeklyTemplateDialog({ open, onOpenChange, scheduleId }: Props) {
  // Only fetch the template list while the dialog is open — keeps
  // /v1/weekly-templates off the schedule page's first-paint critical path.
  const templates = useWeeklyTemplates(open);
  const employees = useEmployees();
  const roles = useRoles();
  const createTpl = useCreateWeeklyTemplate();
  const updateTpl = useUpdateWeeklyTemplate();
  const deleteTpl = useDeleteWeeklyTemplate();
  const applyTpl = useApplyWeeklyTemplate();

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [rows, setRows] = React.useState<RowState[]>([blankRow()]);

  const empList = employees.data ?? [];
  const roleList = roles.data ?? [];

  const loadTemplate = React.useCallback((t: WeeklyTemplate) => {
    setEditingId(t.id);
    setName(t.name);
    setRows(t.shifts.length ? toRows(t) : [blankRow()]);
  }, []);

  const startNew = () => {
    setEditingId(null);
    setName("");
    setRows([blankRow()]);
  };

  const setRow = (i: number, patch: Partial<RowState>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const toggleEmp = (i: number, empId: string) =>
    setRows((rs) =>
      rs.map((r, idx) => {
        if (idx !== i) return r;
        const has = r.defaultEmployeeIds.includes(empId);
        return {
          ...r,
          defaultEmployeeIds: has
            ? r.defaultEmployeeIds.filter((e) => e !== empId)
            : [...r.defaultEmployeeIds, empId],
        };
      }),
    );

  const body = (): WeeklyTemplateInput => ({
    name: name.trim() || "תבנית שבועית",
    shifts: rows.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startLocalTime: r.startLocalTime,
      endLocalTime: r.endLocalTime,
      roleId: r.roleId,
      requiredEmployeeCount: r.requiredEmployeeCount,
      defaultEmployeeIds: r.defaultEmployeeIds,
    })),
  });

  const save = async () => {
    try {
      if (editingId) {
        await updateTpl.mutateAsync({ id: editingId, body: body() });
      } else {
        const created = await createTpl.mutateAsync(body());
        setEditingId(created.id);
      }
      toast.success("התבנית נשמרה");
    } catch {
      toast.error("שמירת התבנית נכשלה");
    }
  };

  const remove = async () => {
    if (!editingId) return;
    try {
      await deleteTpl.mutateAsync(editingId);
      toast.success("התבנית נמחקה");
      startNew();
    } catch {
      toast.error("מחיקת התבנית נכשלה");
    }
  };

  const applyToWeek = async () => {
    if (!editingId || !scheduleId) return;
    try {
      const res = await applyTpl.mutateAsync({ scheduleId, templateId: editingId });
      if (res.message === "week_already_has_shifts") {
        toast.info("לשבוע זה כבר יש משמרות — מחקו אותן או בחרו שבוע ריק");
      } else {
        toast.success(`נטענו ${res.shiftsCreated} משמרות ו-${res.assignmentsCreated} שיבוצים`);
        onOpenChange(false);
      }
    } catch {
      toast.error("טעינת התבנית לשבוע נכשלה");
    }
  };

  const saving = createTpl.isPending || updateTpl.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <CalendarCog className="h-5 w-5 text-primary" />
            תבנית שבועית קבועה
          </DialogTitle>
          <DialogDescription>
            הגדירו פעם אחת את שלד השבוע ועובדי ברירת המחדל — וטענו אותו לכל שבוע בלחיצה.
          </DialogDescription>
        </DialogHeader>

        {/* Template picker */}
        <div className="flex flex-wrap items-center gap-2">
          {(templates.data ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => loadTemplate(t)}
              aria-pressed={editingId === t.id}
              aria-label={`טען תבנית ${t.name}`}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                editingId === t.id
                  ? "bg-indigo-500 text-white"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {t.name}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={startNew}>
            <Plus className="h-4 w-4" /> תבנית חדשה
          </Button>
        </div>

        <div className="space-y-1">
          <Label htmlFor="tpl-name">שם התבנית</Label>
          <Input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: שבוע רגיל"
          />
        </div>

        {/* Rows */}
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="space-y-1">
                  <Label className="text-xs">יום</Label>
                  <select
                    value={r.dayOfWeek}
                    onChange={(e) => setRow(i, { dayOfWeek: Number(e.target.value) })}
                    aria-label="יום בשבוע"
                    className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    {DAYS.map((d, idx) => (
                      <option key={idx} value={idx}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">התחלה</Label>
                  <TimeSelect
                    value={r.startLocalTime}
                    onChange={(v) => setRow(i, { startLocalTime: v })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">סיום</Label>
                  <TimeSelect
                    value={r.endLocalTime}
                    onChange={(v) => setRow(i, { endLocalTime: v })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">תפקיד</Label>
                  <select
                    value={r.roleId ?? ""}
                    onChange={(e) => setRow(i, { roleId: e.target.value || null })}
                    aria-label="תפקיד נדרש למשמרת"
                    className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="">ללא</option>
                    {roleList.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">כמות</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={r.requiredEmployeeCount}
                    onChange={(e) =>
                      setRow(i, { requiredEmployeeCount: Math.max(1, Number(e.target.value)) })
                    }
                    aria-label="מספר עובדים נדרש למשמרת"
                    title="כמה עובדים נדרשים למשמרת הזו"
                    className="h-10"
                  />
                </div>
              </div>

              {/* Default employees */}
              <div className="space-y-1">
                <Label className="text-xs">עובדי ברירת מחדל</Label>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
                  {empList.length === 0 ? (
                    <span className="text-xs text-muted-foreground">אין עובדים</span>
                  ) : (
                    empList.map((e) => {
                      const on = r.defaultEmployeeIds.includes(e.id);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => toggleEmp(i, e.id)}
                          aria-pressed={on}
                          aria-label={`${on ? "הסר" : "הוסף"} את ${e.fullName} כעובד קבוע במשמרת`}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            on
                              ? "border-indigo-500 bg-indigo-500 text-white"
                              : "bg-background hover:bg-muted"
                          }`}
                        >
                          {e.fullName}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  disabled={rows.length === 1}
                  className="text-rose-600"
                >
                  <Trash2 className="h-4 w-4" /> הסר משמרת
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, blankRow()])}
          >
            <Plus className="h-4 w-4" /> הוסף משמרת
          </Button>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {editingId && (
            <Button variant="outline" onClick={remove} className="text-rose-600">
              <Trash2 className="h-4 w-4" /> מחק תבנית
            </Button>
          )}
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? "שומר…" : "שמור תבנית"}
          </Button>
          {editingId && scheduleId && (
            <Button onClick={applyToWeek} disabled={applyTpl.isPending}>
              <Wand2 className="h-4 w-4" />
              {applyTpl.isPending ? "טוען…" : "טען לשבוע הנוכחי"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
