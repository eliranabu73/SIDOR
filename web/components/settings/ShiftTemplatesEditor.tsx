"use client";

import * as React from "react";
import { toast } from "sonner";
import { Trash2, Plus, Edit2, Check, X, Sunrise } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  type ShiftTemplate,
} from "@/lib/api";

interface DraftRow {
  name: string;
  startLocalTime: string;
  endLocalTime: string;
  requiredEmployeeCount: string;
}

const EMPTY_DRAFT: DraftRow = {
  name: "",
  startLocalTime: "08:00",
  endLocalTime: "16:00",
  requiredEmployeeCount: "1",
};

export function ShiftTemplatesEditor() {
  const [rows, setRows] = React.useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftRow>(EMPTY_DRAFT);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<DraftRow>(EMPTY_DRAFT);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await listShiftTemplates();
      setRows(list);
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
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const created = await createShiftTemplate({
        name: draft.name.trim(),
        startLocalTime: draft.startLocalTime,
        endLocalTime: draft.endLocalTime,
        requiredEmployeeCount: parseInt(draft.requiredEmployeeCount, 10),
      });
      setRows((prev) => [...prev, created]);
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      toast.success("תבנית משמרת נוספה");
    } catch {
      toast.error("יצירת תבנית נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (t: ShiftTemplate) => {
    setEditingId(t.id);
    setEditDraft({
      name: t.name,
      startLocalTime: t.startLocalTime,
      endLocalTime: t.endLocalTime,
      requiredEmployeeCount: String(t.requiredEmployeeCount),
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const err = validateDraft(editDraft);
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const updated = await updateShiftTemplate(editingId, {
        name: editDraft.name.trim(),
        startLocalTime: editDraft.startLocalTime,
        endLocalTime: editDraft.endLocalTime,
        requiredEmployeeCount: parseInt(editDraft.requiredEmployeeCount, 10),
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

  const remove = async (id: string) => {
    if (!confirm("למחוק את תבנית המשמרת?")) return;
    try {
      await deleteShiftTemplate(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("תבנית נמחקה");
    } catch {
      toast.error("מחיקת תבנית נכשלה");
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
          <p className="text-sm text-muted-foreground py-2">
            עדיין לא הוגדרו תבניות. הוסף אחת כדי להתחיל.
          </p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="px-3 py-2 text-right font-medium">שם</th>
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
                    <tr key={t.id} className="border-b last:border-0">
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
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        {isEditing ? (
                          <Input
                            type="time"
                            value={editDraft.startLocalTime}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, startLocalTime: e.target.value }))
                            }
                            className="h-8 w-28"
                          />
                        ) : (
                          t.startLocalTime
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums" dir="ltr">
                        {isEditing ? (
                          <Input
                            type="time"
                            value={editDraft.endLocalTime}
                            onChange={(e) =>
                              setEditDraft((p) => ({ ...p, endLocalTime: e.target.value }))
                            }
                            className="h-8 w-28"
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
                            <button
                              onClick={saveEdit}
                              disabled={saving}
                              aria-label="שמור"
                              className="rounded p-2 text-green-600 hover:bg-green-50"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              aria-label="ביטול"
                              className="rounded p-2 text-muted-foreground hover:bg-muted"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => startEdit(t)}
                              aria-label="ערוך"
                              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => remove(t.id)}
                              aria-label="מחק"
                              className="rounded p-2 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {adding ? (
          <div className="rounded-md border bg-muted/20 p-3 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">שם</label>
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                  placeholder="לדוגמה: בוקר"
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">התחלה</label>
                <Input
                  type="time"
                  value={draft.startLocalTime}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, startLocalTime: e.target.value }))
                  }
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">סיום</label>
                <Input
                  type="time"
                  value={draft.endLocalTime}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, endLocalTime: e.target.value }))
                  }
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">עובדים</label>
                <Input
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
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
                ביטול
              </Button>
              <Button size="sm" onClick={submitNew} disabled={saving}>
                {saving ? "שומר…" : "הוסף תבנית"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} className="w-full">
            <Plus className="me-1 h-4 w-4" />
            הוסף תבנית משמרת
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
