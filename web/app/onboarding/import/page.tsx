"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Logo } from "@/components/brand/Logo";
import {
  parseImportImage,
  applyImport,
  type ParsedSchedule,
  type ParsedEmployee,
  type ParsedShift,
} from "@/lib/api";

type Mime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const HEB_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function fileToBase64(file: File): Promise<{ base64: string; mime: Mime }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const m = /^data:(.*?);base64,(.*)$/.exec(r);
      if (!m) {
        reject(new Error("לא הצלחנו לקרוא את הקובץ"));
        return;
      }
      const mime = (m[1] ?? "image/jpeg") as Mime;
      const allowed: Mime[] = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ];
      if (!allowed.includes(mime)) {
        reject(new Error(`סוג קובץ לא נתמך: ${mime}`));
        return;
      }
      resolve({ base64: m[2] ?? "", mime });
    };
    reader.onerror = () => reject(new Error("שגיאת קריאת קובץ"));
    reader.readAsDataURL(file);
  });
}

interface EditableEmployee extends ParsedEmployee {
  skip: boolean;
}
interface EditableShift extends ParsedShift {
  skip: boolean;
}

function dayLabel(d: number | string): string {
  if (typeof d === "string") return d;
  return HEB_DAYS[d] ?? `יום ${d}`;
}

function ImportFlow() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<"upload" | "parsing" | "preview" | "applying">(
    "upload",
  );
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null);
  const [hints, setHints] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedSchedule | null>(null);
  const [employees, setEmployees] = React.useState<EditableEmployee[]>([]);
  const [shifts, setShifts] = React.useState<EditableShift[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const onFiles = React.useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const file = files[0]!;
      if (file.size > 8 * 1024 * 1024) {
        toast.error("הקובץ גדול מ-8MB. דחס או צלם מחדש.");
        return;
      }
      setPhase("parsing");
      setPreviewSrc(URL.createObjectURL(file));
      try {
        const { base64, mime } = await fileToBase64(file);
        const result = await parseImportImage({
          imageBase64: base64,
          mimeType: mime,
          ...(hints.trim() ? { hints: hints.trim() } : {}),
        });
        setParsed(result);
        setEmployees(result.employees.map((e) => ({ ...e, skip: false })));
        setShifts(result.shifts.map((s) => ({ ...s, skip: false })));
        setPhase("preview");
        toast.success(
          `זוהו ${result.employees.length} עובדים ו-${result.shifts.length} משמרות`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "ניתוח התמונה נכשל";
        toast.error(msg);
        setPhase("upload");
      }
    },
    [hints],
  );

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      void onFiles(e.dataTransfer.files);
    },
    [onFiles],
  );

  const updateEmployee = (i: number, patch: Partial<EditableEmployee>) => {
    setEmployees((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  };
  const updateShift = (i: number, patch: Partial<EditableShift>) => {
    setShifts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const onApply = async () => {
    if (!parsed) return;
    setPhase("applying");
    try {
      const result = await applyImport({
        ...(parsed.weekStart ? { weekStart: parsed.weekStart } : {}),
        employees: employees.map((e) => ({
          fullName: e.fullName,
          ...(e.phone ? { phone: e.phone } : {}),
          ...(e.role ? { role: e.role } : {}),
          skip: e.skip,
        })),
        shifts: shifts.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          ...(s.role ? { role: s.role } : {}),
          ...(s.employees ? { employees: s.employees } : {}),
          skip: s.skip,
        })),
      });
      toast.success(
        `נוצרו ${result.createdEmployees} עובדים ו-${result.createdShifts} משמרות`,
      );
      router.replace("/schedule");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "יצירת הסידור נכשלה";
      toast.error(msg);
      setPhase("preview");
    }
  };

  // Group shifts by day for preview.
  const shiftsByDay = React.useMemo(() => {
    const groups = new Map<string, Array<{ idx: number; s: EditableShift }>>();
    shifts.forEach((s, idx) => {
      const key = dayLabel(s.dayOfWeek);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ idx, s });
    });
    return Array.from(groups.entries());
  }, [shifts]);

  return (
    <div className="mesh-bg min-h-screen p-4">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <Logo size={36} />
          <a
            href="/onboarding"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← חזרה לאשף
          </a>
        </div>

        {phase === "upload" && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>יבוא סידור מתמונה</CardTitle>
              <CardDescription>
                העלה צילום מסך מאקסל, צילום הודעת וואטסאפ או תמונה של סידור על נייר.
                ה-AI שלנו יזהה עובדים, תפקידים ושעות תוך שניות.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="hints">רמזים (אופציונלי)</Label>
                <Input
                  id="hints"
                  placeholder="למשל: זה סידור של מסעדה, תחילת השבוע יום ראשון 19/01"
                  value={hints}
                  onChange={(e) => setHints(e.target.value)}
                />
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background/40 p-12 text-center transition hover:border-indigo-400 hover:bg-background/60"
              >
                <div className="mb-2 text-3xl" aria-hidden>
                  📷
                </div>
                <div className="text-sm font-medium">
                  גרור תמונה לכאן או לחץ לבחירה
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  JPG / PNG / WebP · עד 8MB
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onFiles(e.target.files)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "parsing" && (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <div className="size-12 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
              <div className="text-base font-medium">מנתח את הסידור…</div>
              <div className="text-sm text-muted-foreground">
                Claude Vision קורא את התמונה — זה לוקח 5-15 שניות
              </div>
              {previewSrc && (
                <img
                  src={previewSrc}
                  alt="תצוגה מקדימה"
                  className="mt-4 max-h-40 rounded-md border border-border opacity-70"
                />
              )}
            </CardContent>
          </Card>
        )}

        {phase === "preview" && parsed && (
          <>
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>תצוגה מקדימה</CardTitle>
                <CardDescription>
                  ודא את הפרטים, ערוך לפי הצורך, ובטל סימון לכל פריט שאינו רלוונטי.
                  רמת ביטחון של ה-AI: {(parsed.confidence * 100).toFixed(0)}%
                  {parsed.notes && ` · ${parsed.notes}`}
                </CardDescription>
              </CardHeader>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>עובדים ({employees.filter((e) => !e.skip).length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {employees.length === 0 && (
                    <div className="text-sm text-muted-foreground">לא זוהו עובדים</div>
                  )}
                  {employees.map((e, i) => (
                    <div
                      key={i}
                      className={`rounded-md border border-border p-2 ${
                        e.skip ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-2"
                          checked={!e.skip}
                          onChange={(ev) => updateEmployee(i, { skip: !ev.target.checked })}
                          aria-label="כלול עובד"
                        />
                        <div className="flex-1 space-y-1">
                          <Input
                            value={e.fullName}
                            onChange={(ev) => updateEmployee(i, { fullName: ev.target.value })}
                            placeholder="שם מלא"
                            className="h-8"
                          />
                          <div className="grid grid-cols-2 gap-1">
                            <Input
                              value={e.phone ?? ""}
                              onChange={(ev) =>
                                updateEmployee(i, { phone: ev.target.value })
                              }
                              placeholder="טלפון"
                              className="h-8"
                            />
                            <Input
                              value={e.role ?? ""}
                              onChange={(ev) =>
                                updateEmployee(i, { role: ev.target.value })
                              }
                              placeholder="תפקיד"
                              className="h-8"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>משמרות ({shifts.filter((s) => !s.skip).length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {shifts.length === 0 && (
                    <div className="text-sm text-muted-foreground">לא זוהו משמרות</div>
                  )}
                  {shiftsByDay.map(([day, items]) => (
                    <div key={day} className="space-y-1">
                      <div className="text-sm font-semibold text-indigo-500">{day}</div>
                      {items.map(({ idx, s }) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 rounded-md border border-border p-2 text-sm ${
                            s.skip ? "opacity-40" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!s.skip}
                            onChange={(ev) =>
                              updateShift(idx, { skip: !ev.target.checked })
                            }
                            aria-label="כלול משמרת"
                          />
                          <Input
                            value={s.startTime}
                            onChange={(ev) => updateShift(idx, { startTime: ev.target.value })}
                            className="h-7 w-20"
                          />
                          <span aria-hidden>–</span>
                          <Input
                            value={s.endTime}
                            onChange={(ev) => updateShift(idx, { endTime: ev.target.value })}
                            className="h-7 w-20"
                          />
                          <Input
                            value={s.role ?? ""}
                            onChange={(ev) => updateShift(idx, { role: ev.target.value })}
                            placeholder="תפקיד"
                            className="h-7 flex-1"
                          />
                          {s.employees && s.employees.length > 0 && (
                            <span className="text-xs text-muted-foreground" title={s.employees.join(", ")}>
                              {s.employees.length} עובד׳
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setPhase("upload");
                  setParsed(null);
                  setEmployees([]);
                  setShifts([]);
                  setPreviewSrc(null);
                }}
              >
                העלה תמונה אחרת
              </Button>
              <Button
                variant="glow"
                onClick={onApply}
                disabled={
                  employees.filter((e) => !e.skip).length === 0 &&
                  shifts.filter((s) => !s.skip).length === 0
                }
              >
                אשר ויצור
              </Button>
            </div>
          </>
        )}

        {phase === "applying" && (
          <Card className="glass-card">
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <div className="size-12 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
              <div className="text-base font-medium">יוצר את הסידור…</div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function OnboardingImportPage() {
  return (
    <AuthGuard>
      <ImportFlow />
    </AuthGuard>
  );
}
