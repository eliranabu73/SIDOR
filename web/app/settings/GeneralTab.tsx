"use client";

import * as React from "react";
import { Save, Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="space-y-4">
      {/* Logo upload card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>לוגו העסק</CardTitle>
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
                className="justify-start"
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

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>פרטי העסק</CardTitle>
          <CardDescription>שם, תחום פעילות ואזור זמן</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="org-name">שם העסק</Label>
            <Input
              id="org-name"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="מסעדת הדוגמה"
            />
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
              className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
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
              className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
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
              className="flex h-11 sm:h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              <option value={0}>ראשון</option>
              <option value={1}>שני</option>
              <option value={6}>שבת</option>
            </select>
          </div>

          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <Label htmlFor="show-tips" className="cursor-pointer">
                  חלוקת טיפים
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  הצג אפשרות לחלוקת טיפים בניווט (מתאים לבתי אוכל ומסעדות)
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  id="show-tips"
                  type="checkbox"
                  checked={showTips}
                  onChange={(e) => toggleShowTips(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-background after:border after:border-border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
              </label>
            </div>
          </div>

          {settings && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              תוכנית:{" "}
              <span className="font-semibold text-indigo-500">{settings.plan}</span>
            </div>
          )}

          <Button variant="glow" onClick={onSave} disabled={saving} className="w-full">
            <Save className="me-2 h-4 w-4" />
            {saving ? "שומר…" : "שמור פרטי עסק"}
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>שעות פעילות ומגבלות</CardTitle>
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
              />
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
              />
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
              />
            </div>
          </div>

          <Button
            variant="glow"
            onClick={onSaveLaborRules}
            disabled={saving}
            className="w-full"
          >
            <Save className="me-2 h-4 w-4" />
            {saving ? "שומר…" : "שמור שעות פעילות"}
          </Button>
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
