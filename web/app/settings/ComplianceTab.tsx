"use client";

import * as React from "react";
import { Save } from "lucide-react";
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
import type { OrgSettings } from "@/lib/api";

export interface ComplianceTabProps {
  settings: OrgSettings | null;
  maxHoursDay: string;
  setMaxHoursDay: (v: string) => void;
  maxHoursWeek: string;
  setMaxHoursWeek: (v: string) => void;
  minRestHours: string;
  setMinRestHours: (v: string) => void;
  shiftTypesRaw: string;
  setShiftTypesRaw: (v: string) => void;
  bizStart: string;
  setBizStart: (v: string) => void;
  bizEnd: string;
  setBizEnd: (v: string) => void;
  roleRates: Record<string, string>;
  setRoleRates: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: boolean;
  onSave: () => void;
}

export default function ComplianceTab({
  settings,
  maxHoursDay,
  setMaxHoursDay,
  maxHoursWeek,
  setMaxHoursWeek,
  minRestHours,
  setMinRestHours,
  shiftTypesRaw,
  setShiftTypesRaw,
  bizStart,
  setBizStart,
  bizEnd,
  setBizEnd,
  roleRates,
  setRoleRates,
  saving,
  onSave,
}: ComplianceTabProps) {
  return (
    <div className="space-y-4">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>הגבלות שעות</CardTitle>
          <CardDescription>
            מגבלות חוקיות ועסקיות — ייאכפו אוטומטית בבניית הסידור.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
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
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>שעות פעילות ורמות משמרת</CardTitle>
          <CardDescription>
            הגדר את שעות הפתיחה/סגירה וסוגי המשמרות בעסק.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="biz-start">פתיחה</Label>
              <Input
                id="biz-start"
                type="time"
                value={bizStart}
                onChange={(e) => setBizStart(e.target.value)}
                placeholder="08:00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="biz-end">סגירה</Label>
              <Input
                id="biz-end"
                type="time"
                value={bizEnd}
                onChange={(e) => setBizEnd(e.target.value)}
                placeholder="23:00"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="shift-types">סוגי משמרות (מופרדים בפסיק)</Label>
            <Input
              id="shift-types"
              value={shiftTypesRaw}
              onChange={(e) => setShiftTypesRaw(e.target.value)}
              placeholder="בוקר, צהריים, ערב, לילה"
            />
            <p className="text-xs text-muted-foreground">
              ישמשו כתגיות במשמרות ובדוחות.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>עלות שעה לפי תפקיד (₪)</CardTitle>
          <CardDescription>
            ישמשו לחישוב עלות עבודה בדוחות. השאר ריק להשתמש בשיעור ברירת המחדל.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {settings?.roles.length === 0 && (
            <p className="text-sm text-muted-foreground">
              הוסף תפקידים בלשונית &quot;תפקידים&quot; תחילה.
            </p>
          )}
          {settings?.roles.map((role) => (
            <div key={role.id} className="flex items-center gap-3">
              <Label htmlFor={`rate-${role.id}`} className="w-40 shrink-0 text-sm">
                {role.name}
              </Label>
              <Input
                id={`rate-${role.id}`}
                type="number"
                min={0}
                step={5}
                className="w-28"
                placeholder="50"
                value={roleRates[role.name] ?? ""}
                onChange={(e) =>
                  setRoleRates((prev) => ({ ...prev, [role.name]: e.target.value }))
                }
              />
              <span className="text-sm text-muted-foreground">₪ / שעה</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button variant="glow" onClick={onSave} disabled={saving} className="w-full">
        <Save className="me-2 h-4 w-4" />
        {saving ? "שומר…" : "שמור כללי עבודה"}
      </Button>
    </div>
  );
}
