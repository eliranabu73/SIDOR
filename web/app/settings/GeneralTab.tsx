"use client";

import * as React from "react";
import { Save, Upload, X, Image as ImageIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimeSelect } from "@/components/ui/TimeSelect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { INDUSTRY_OPTIONS } from "@/lib/industries";
import type { OrgSettings } from "@/lib/api";
import { ShiftTemplatesEditor } from "@/components/settings/ShiftTemplatesEditor";

const TIMEZONES = [
  "Asia/Jerusalem",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export interface GeneralTabProps {
  settings: OrgSettings | null;
  // Org basics
  orgName: string;
  setOrgName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  weekStartDay: number;
  setWeekStartDay: (v: number) => void;
  // Work-hours / labor rules (formerly ComplianceTab)
  bizStart: string;
  setBizStart: (v: string) => void;
  bizEnd: string;
  setBizEnd: (v: string) => void;
  maxHoursDay: string;
  setMaxHoursDay: (v: string) => void;
  maxHoursWeek: string;
  setMaxHoursWeek: (v: string) => void;
  minRestHours: string;
  setMinRestHours: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onSaveLaborRules: () => void;
  onLogoUpload: (file: File) => Promise<void>;
  onLogoRemove: () => Promise<void>;
  logoUploading?: boolean;
}

/** Small inline error line shown UNDER an invalid field. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

/** "saved" pill that fades after a successful save. */
function SavedHint({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
      <Check className="h-3.5 w-3.5" />
      נשמר
    </span>
  );
}

export default function GeneralTab({
  settings,
  orgName,
  setOrgName,
  industry,
  setIndustry,
  timezone,
  setTimezone,
  weekStartDay,
  setWeekStartDay,
  bizStart,
  setBizStart,
  bizEnd,
  setBizEnd,
  maxHoursDay,
  setMaxHoursDay,
  maxHoursWeek,
  setMaxHoursWeek,
  minRestHours,
  setMinRestHours,
  saving,
  onSave,
  onSaveLaborRules,
  onLogoUpload,
  onLogoRemove,
  logoUploading = false,
}: GeneralTabProps) {
  const [showTips, setShowTips] = React.useState<boolean>(false);

  React.useEffect(() => {
    try {
      setShowTips(localStorage.getItem("sidor_show_tips") === "true");
    } catch {
      setShowTips(false);
    }
  }, []);

  const toggleShowTips = (next: boolean) => {
    setShowTips(next);
    try {
      localStorage.setItem("sidor_show_tips", next ? "true" : "false");
      // Notify AppShell in the same tab — storage events don't fire for same-tab writes.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "sidor_show_tips",
          newValue: next ? "true" : "false",
        }),
      );
    } catch {
      /* ignore */
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const currentLogo = settings?.logoUrl ?? null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-uploaded after removal
    e.target.value = "";
    await onLogoUpload(file);
  };

  // ── Inline validation ──────────────────────────────────────────────
  // Errors surface only after the user attempts to save that section, so the
  // form isn't noisy on first render.
  const [bizSubmitted, setBizSubmitted] = React.useState(false);
  const [hoursSubmitted, setHoursSubmitted] = React.useState(false);
  const [bizSaved, setBizSaved] = React.useState(false);
  const [hoursSaved, setHoursSaved] = React.useState(false);

  const nameError = !orgName.trim() ? "שם העסק נדרש" : undefined;

  const numErr = (raw: string, min: number, max: number): string | undefined => {
    if (!raw.trim()) return undefined; // optional — empty clears the rule
    const n = Number(raw);
    if (!Number.isFinite(n)) return "יש להזין מספר";
    if (n < min || n > max) return `הזן ערך בין ${min} ל-${max}`;
    return undefined;
  };

  const maxDayError = numErr(maxHoursDay, 1, 24);
  const maxWeekError = numErr(maxHoursWeek, 1, 168);
  const minRestError = numErr(minRestHours, 0, 24);
  const hoursOrderError =
    bizStart && bizEnd && bizStart === bizEnd
      ? "שעת פתיחה וסגירה זהות"
      : undefined;

  const bizValid = !nameError;
  const hoursValid =
    !maxDayError && !maxWeekError && !minRestError && !hoursOrderError;

  // Track save completion to flash the "נשמר" hint. `saving` flips true then
  // back to false on success; we watch the falling edge after a submit.
  const prevSaving = React.useRef(saving);
  React.useEffect(() => {
    if (prevSaving.current && !saving) {
      if (bizSubmitted) {
        setBizSaved(true);
        const t = setTimeout(() => setBizSaved(false), 2500);
        return () => clearTimeout(t);
      }
      if (hoursSubmitted) {
        setHoursSaved(true);
        const t = setTimeout(() => setHoursSaved(false), 2500);
        return () => clearTimeout(t);
      }
    }
    prevSaving.current = saving;
  }, [saving, bizSubmitted, hoursSubmitted]);

  const handleSaveBiz = () => {
    setBizSubmitted(true);
    setHoursSubmitted(false);
    if (!bizValid) return;
    onSave();
  };

  const handleSaveHours = () => {
    setHoursSubmitted(true);
    setBizSubmitted(false);
    if (!hoursValid) return;
    onSaveLaborRules();
  };

  return (
    <div className="space-y-4">
      {/* ── Card 1: מיתוג (logo) ── */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>מיתוג</CardTitle>
          <CardDescription>
            הלוגו יופיע אוטומטית בכל ייצוא סידור עבודה (PNG / PDF).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Preview */}
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/40 overflow-hidden"
              aria-label="תצוגה מקדימה של לוגו"
            >
              {currentLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentLogo}
                  alt="לוגו העסק"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 flex-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                className="sr-only"
                onChange={handleFileChange}
                aria-label="בחר קובץ לוגו"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={logoUploading}
                className="justify-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Upload className="h-4 w-4" />
                {logoUploading
                  ? "מעלה…"
                  : currentLogo
                    ? "החלף לוגו"
                    : "העלה לוגו"}
              </Button>
              {currentLogo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogoRemove}
                  disabled={logoUploading}
                  className="justify-start text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                  הסר לוגו
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                PNG, JPG, WebP, SVG — עד 5 MB. יחס רצוי: ריבוע או רוחבי.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: פרטי העסק ── */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>פרטי העסק</CardTitle>
          <CardDescription>
            שם, תחום פעילות, אזור זמן, תחילת שבוע וטיפים.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="org-name">שם העסק</Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="מסעדת הדוגמה"
              aria-invalid={bizSubmitted && !!nameError}
              aria-describedby={nameError ? "org-name-error" : undefined}
            />
            {bizSubmitted && (
              <FieldError id="org-name-error" message={nameError} />
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="industry">תחום / סוג עסק</Label>
            <select
              id="industry"
              value={INDUSTRY_OPTIONS.find((o) => o.value === industry) ? industry : "other"}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== "other") setIndustry(v);
              }}
              className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {INDUSTRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {(!INDUSTRY_OPTIONS.find((o) => o.value === industry) ||
              industry === "other") && (
              <Input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="הזן תחום פעילות..."
                aria-label="תחום פעילות מותאם אישית"
              />
            )}
            <p className="text-xs text-muted-foreground">
              ניתן להגדיר כל תחום — הסידור יבנה לפי התפקידים וכללי העבודה שתגדיר.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="timezone">אזור זמן</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              {!TIMEZONES.includes(timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="week-start">תחילת שבוע</Label>
            <select
              id="week-start"
              value={weekStartDay}
              onChange={(e) => setWeekStartDay(Number(e.target.value))}
              className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value={0}>ראשון</option>
              <option value={1}>שני</option>
              <option value={6}>שבת</option>
            </select>
            <p className="text-xs text-muted-foreground">
              היום שבו מתחיל לוח השבוע בסידור.
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Label htmlFor="show-tips" className="cursor-pointer">
                  חלוקת טיפים
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  הצג אפשרות לחלוקת טיפים בניווט (מתאים לבתי אוכל ומסעדות)
                </p>
              </div>
              <Switch
                id="show-tips"
                checked={showTips}
                onCheckedChange={toggleShowTips}
                aria-label="הצג חלוקת טיפים"
                className="shrink-0"
              />
            </div>
          </div>

          {settings && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              תוכנית:{" "}
              <span className="font-semibold text-indigo-500">{settings.plan}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <SavedHint show={bizSaved} />
            <Button
              variant="glow"
              onClick={handleSaveBiz}
              disabled={saving}
              className="ms-auto"
            >
              <Save className="me-2 h-4 w-4" />
              {saving && bizSubmitted ? "שומר…" : "שמור פרטי עסק"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: שעות פעילות וחוקי עבודה ── */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>שעות פעילות וחוקי עבודה</CardTitle>
          <CardDescription>
            שעות פתיחה/סגירה ומגבלות חוקיות — נאכפות אוטומטית בבניית הסידור.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="biz-start">פתיחה</Label>
              <TimeSelect
                id="biz-start"
                value={bizStart}
                onChange={setBizStart}
                aria-label="שעת פתיחה"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="biz-end">סגירה</Label>
              <TimeSelect
                id="biz-end"
                value={bizEnd}
                onChange={setBizEnd}
                aria-label="שעת סגירה"
              />
            </div>
          </div>
          {hoursSubmitted && (
            <FieldError id="biz-hours-error" message={hoursOrderError} />
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="max-day">מקס׳ שעות ביום</Label>
              <Input
                id="max-day"
                type="number"
                min={1}
                max={24}
                value={maxHoursDay}
                onChange={(e) => setMaxHoursDay(e.target.value)}
                placeholder="10"
                aria-invalid={hoursSubmitted && !!maxDayError}
                aria-describedby={maxDayError ? "max-day-error" : undefined}
              />
              {hoursSubmitted && (
                <FieldError id="max-day-error" message={maxDayError} />
              )}
              <p className="text-xs text-muted-foreground">
                נאכף בעת שיבוץ אוטומטי.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="max-week">מקס׳ שעות בשבוע</Label>
              <Input
                id="max-week"
                type="number"
                min={1}
                max={168}
                value={maxHoursWeek}
                onChange={(e) => setMaxHoursWeek(e.target.value)}
                placeholder="48"
                aria-invalid={hoursSubmitted && !!maxWeekError}
                aria-describedby={maxWeekError ? "max-week-error" : undefined}
              />
              {hoursSubmitted && (
                <FieldError id="max-week-error" message={maxWeekError} />
              )}
              <p className="text-xs text-muted-foreground">
                נאכף בעת שיבוץ אוטומטי.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="min-rest">מינימום מנוחה (שעות)</Label>
              <Input
                id="min-rest"
                type="number"
                min={0}
                max={24}
                value={minRestHours}
                onChange={(e) => setMinRestHours(e.target.value)}
                placeholder="8"
                aria-invalid={hoursSubmitted && !!minRestError}
                aria-describedby={minRestError ? "min-rest-error" : undefined}
              />
              {hoursSubmitted && (
                <FieldError id="min-rest-error" message={minRestError} />
              )}
              <p className="text-xs text-muted-foreground">
                מנוחה מינימלית בין משמרות — נאכפת בעת שיבוץ אוטומטי.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <SavedHint show={hoursSaved} />
            <Button
              variant="glow"
              onClick={handleSaveHours}
              disabled={saving}
              className="ms-auto"
            >
              <Save className="me-2 h-4 w-4" />
              {saving && hoursSubmitted ? "שומר…" : "שמור שעות וחוקים"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ShiftTemplatesEditor />

      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="p-4 text-sm text-amber-900">
          💡 שכר שעתי מוגדר עכשיו לכל עובד בנפרד בכרטיס העובד. רוצה להפוך עובד
          לשעה אחרת? לך לעמוד העובדים.
        </CardContent>
      </Card>
    </div>
  );
}
