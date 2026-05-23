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
import { INDUSTRY_OPTIONS } from "@/lib/industries";
import type { OrgSettings } from "@/lib/api";

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
  orgName: string;
  setOrgName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  weekStartDay: number;
  setWeekStartDay: (v: number) => void;
  saving: boolean;
  onSave: () => void;
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
  saving,
  onSave,
}: GeneralTabProps) {
  return (
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

        {settings && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            תוכנית:{" "}
            <span className="font-semibold text-indigo-500">{settings.plan}</span>
          </div>
        )}

        <Button variant="glow" onClick={onSave} disabled={saving} className="w-full">
          <Save className="me-2 h-4 w-4" />
          {saving ? "שומר…" : "שמור שינויים"}
        </Button>
      </CardContent>
    </Card>
  );
}
