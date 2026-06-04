"use client";

import * as React from "react";
import { toast } from "sonner";
import { Trash2, Plus, Edit2, Check, X, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSelect } from "@/components/ui/TimeSelect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listShiftTemplates,
  createShiftTemplate,
  updateShiftTemplate,
  deleteShiftTemplate,
  fetchRoles,
  type ShiftTemplate,
  type RoleItem,
} from "@/lib/api";

interface DraftRow {
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: string;
  roleId: string; // "" = any role
}

const EMPTY_DRAFT: DraftRow = {
  name: "",
  startLocalTime: "08:00",
  endLocalTime: "16:00",
  requiredEmployeeCount: "1",
  roleId: "",
};

export function ShiftTemplatesEditor() {
  const [rows, setRows] = React.useState<ShiftTemplate[]>([]);
  const [roles, setRoles] = React.useState<RoleItem[]>([]);
  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name ?? "כל תפקיד";
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftRow>(EMPTY_DRAFT);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<DraftRow>(EMPTY_DRAFT);
  const [saving, setSaving] = React.useState(false);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [list, roleList] = await Promise.all([listShiftTemplates(), fetchRoles().catch(() => [])]);
      setRows(list);
      setRoles(roleList);
    } catch {
      toast.error("שגיאה בטעינת תבניות המשמרות");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const validateDraft = (d: DraftRow): string | null => {
    if (!d.name.trim()) return "שם נדרש";
    if (!/^\d{2}:\d{2}$/.test(d.startLocalTime)) return "שעת התחלה לא תקינה";
    if (!/^\d{2}:\d{2}$/.test(d.endLocalTime)) return "שעת סיום לא תקינה";
    const n = parseInt(d.requiredEmployeeCount, 10);
    if (!Number.isFinite(n) || n < 1) return "מספר עובדים חייב להיות 1 ומעלה";
    return null;
  };

  const submitNew = async () => {
    const err = validateDraft(draft);
    if (err) {
      setAddError(err);
      return;
    }
    setAddError(null);
    setSaving(true);
    try {
      const created = await createShiftTemplate({
        name: draft.name.trim(),
        startLocalTime: draft.startLocalTime,
        endLocalTime: draft.endLocalTime,
        requiredEmployeeCount: parseInt(draft.requiredEmployeeCount, 10),
        roleId: draft.roleId || null,
      });
      setRows((prev) => [...prev, created]);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      setAddError(null);
      toast.success("תבנית משמרת נוספה");
    } catch {
      toast.error("יצירת תבנית נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t: ShiftTemplate) => {
    setEditingId(t.id);
    setEditError(null);
    setEditDraft({
      name: t.name,
      startLocalTime: t.startLocalTime,
      endLocalTime: t.endLocalTime,
      requiredEmployeeCount: String(t.requiredEmployeeCount),
      roleId: t.roleId ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const err = validateDraft(editDraft);
    if (err) {
      setEditError(err);
      return;
    }
    setEditError(null);
    setSaving(true);
    try {
      const updated = await updateShiftTemplate(editingId, {
        name: editDraft.name.trim(),
        startLocalTime: editDraft.startLocalTime,
        endLocalTime: editDraft.endLocalTime,
        requiredEmployeeCount: parseInt(editDraft.requiredEmployeeCount, 10),
        roleId: editDraft.roleId || null,
      });
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setEditingId(null);
      toast.success("תבנית עודכנה");
    } catch {
      toast.error("עדכון תבנית נכשל");
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await deleteShiftTemplate(pendingDeleteId);
      setRows((prev) => prev.filter((r) => r.id !== pendingDeleteId));
      toast.success("תבנית נמחקה");
      setPendingDeleteId(null);
    } catch {
      toast.error("מחיקת תבנית נכשלה");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <Sunrise className="h-5 w-5 text-amber-500" />
          תבניות משמרת
        </CardTitle>
        <CardDescription>
          הגדרת תבניות משמרת מותאמות אישית (בוקר, ערב, ארוחת צהריים, אירוע מיוחד וכדומה). בעת
          יצירת משמרת אפשר לבחור תבנית ולמלא את השעות אוטומטית.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="h-20 animate-pulse rounded-md bg-muted/40" />
        ) : rows.length === 0 && !adding ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 py-8 text-center">
            <Sunrise className="h-8 w-8 text-amber-400" aria-hidden />
            <p className="text-sm font-medium">עדיין לא הוגדרו תבניות משמרת</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              הוסף תבנית ראשונה (לדוגמה: בוקר 08:00–16:00) כדי למלא שעות אוטומטית
              בעת יצירת משמרת.
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-right font-medium">שם</th>
                  <th className="px-3 py-2 text-right font-medium">תפקיד</th>
                  <th className="px-3 py-2 text-right font-medium">התחלה</th>
                  <th className="px-3 py-2 text-right font-medium">סיום</th>
                  <th className="px-3 py-2 text-right font-medium">עובדים</th>
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const isEditing = editingId === t.id;
                  return (
                    <React.Fragment key={t.id}>
                    <tr className="border-b last:border-0">
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <Input
                            value={editDraft.name}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, name: e.target.value }))
                            }
                            className="h-8"
                          />
                        ) : (
                          <span className="font-medium">{t.name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {isEditing ? (
                          <select
                            value={editDraft.roleId}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, roleId: e.target.value }))
                            }
                            className="h-8 rounded-md border bg-background px-2 text-sm"
                          >
                            <option value="">כל תפקיד</option>
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">{roleName(t.roleId)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        {isEditing ? (
                          <TimeSelect
                            value={editDraft.startLocalTime}
                            onChange={(v) =>
                              setEditDraft((p) => ({ ...p, startLocalTime: v }))
                            }
                            aria-label="שעת התחלה"
                          />
                        ) : (
                          t.startLocalTime
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        {isEditing ? (
                          <TimeSelect
                            value={editDraft.endLocalTime}
                            onChange={(v) =>
                              setEditDraft((p) => ({ ...p, endLocalTime: v }))
                            }
                            aria-label="שעת סיום"
                          />
                        ) : (
                          <>
                            {t.endLocalTime}
                            {t.crossesMidnight && (
                              <span className="ms-1 text-[10px] text-muted-foreground">(+1)</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {isEditing ? (
                          <Input
                            type="number"
                            min={1}
                            max={99}
                            value={editDraft.requiredEmployeeCount}
                            onChange={(e) =>
                              setEditDraft((p) => ({
                                ...p,
                                requiredEmployeeCount: e.target.value,
                              }))
                            }
                            className="h-8 w-16"
                          />
                        ) : (
                          t.requiredEmployeeCount
                        )}
                      </td>
                      <td className="px-3 py-2 text-end">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={saveEdit}
                              disabled={saving}
                              aria-label="שמור"
                              className="h-8 w-8 text-green-600 hover:bg-green-50 hover:text-green-700"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingId(null);
                                setEditError(null);
                              }}
                              aria-label="ביטול"
                              className="h-8 w-8 text-muted-foreground"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => startEdit(t)}
                              aria-label="ערוך"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setPendingDeleteId(t.id)}
                              aria-label="מחק"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isEditing && editError && (
                      <tr>
                        <td colSpan={6} className="px-3 pb-2">
                          <p role="alert" className="text-xs text-destructive">
                            {editError}
                          </p>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {adding ? (
          <div className="rounded-md border bg-muted/20 p-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="tpl-name" className="text-xs text-muted-foreground">
                  שם
                </Label>
                <Input
                  id="tpl-name"
                  value={draft.name}
                  onChange={(e) => {
                    setDraft((p) => ({ ...p, name: e.target.value }));
                    if (addError) setAddError(null);
                  }}
                  placeholder="לדוגמה: בוקר"
                  className="h-9"
                  aria-invalid={!!addError}
                  aria-describedby={addError ? "tpl-add-error" : undefined}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="tpl-role" className="text-xs text-muted-foreground">
                  תפקיד
                </Label>
                <select
                  id="tpl-role"
                  value={draft.roleId}
                  onChange={(e) => setDraft((p) => ({ ...p, roleId: e.target.value }))}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">כל תפקיד</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">התחלה</Label>
                <TimeSelect
                  value={draft.startLocalTime}
                  onChange={(v) => setDraft((p) => ({ ...p, startLocalTime: v }))}
                  aria-label="שעת התחלה"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">סיום</Label>
                <TimeSelect
                  value={draft.endLocalTime}
                  onChange={(v) => setDraft((p) => ({ ...p, endLocalTime: v }))}
                  aria-label="שעת סיום"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tpl-count" className="text-xs text-muted-foreground">
                  עובדים
                </Label>
                <Input
                  id="tpl-count"
                  type="number"
                  min={1}
                  max={99}
                  value={draft.requiredEmployeeCount}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, requiredEmployeeCount: e.target.value }))
                  }
                  className="h-9"
                />
              </div>
            </div>
            {addError && (
              <p id="tpl-add-error" role="alert" className="text-xs text-destructive">
                {addError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setAddError(null);
                }}
              >
                ביטול
              </Button>
              <Button size="sm" onClick={submitNew} disabled={saving}>
                {saving ? "שומר…" : "הוסף תבנית"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            className="w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Plus className="me-1 h-4 w-4" />
            הוסף תבנית משמרת
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="מחיקת תבנית משמרת"
        description="למחוק את תבנית המשמרת? לא ניתן לבטל פעולה זו."
        confirmLabel="מחק"
        onConfirm={confirmRemove}
        destructive
        pending={deleting}
      />
    </Card>
  );
}
