"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Building2, MapPin, Shield, Tag } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import {
  fetchSettings,
  patchSettings,
  type OrgSettings,
  type LaborRules,
} from "@/lib/api";

type Tab = "general" | "roles" | "locations" | "compliance";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "כללי", icon: <Building2 className="h-4 w-4" /> },
  { id: "roles", label: "תפקידים", icon: <Tag className="h-4 w-4" /> },
  { id: "locations", label: "סניפים", icon: <MapPin className="h-4 w-4" /> },
  { id: "compliance", label: "כללי עבודה", icon: <Shield className="h-4 w-4" /> },
];

function TabSkeleton() {
  return (
    <div className="h-64 animate-pulse rounded-lg bg-muted/50" aria-hidden="true" />
  );
}

// Lazy load each tab's content — only fetched when selected.
const GeneralTab = dynamic(() => import("./GeneralTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const RolesTab = dynamic(() => import("./RolesTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const LocationsTab = dynamic(() => import("./LocationsTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const ComplianceTab = dynamic(() => import("./ComplianceTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});

function SettingsContent() {
  const [tab, setTab] = React.useState<Tab>("general");
  const [settings, setSettings] = React.useState<OrgSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // General form state
  const [orgName, setOrgName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [timezone, setTimezone] = React.useState("Asia/Jerusalem");
  const [weekStartDay, setWeekStartDay] = React.useState(0);

  // Compliance form state
  const [maxHoursDay, setMaxHoursDay] = React.useState("");
  const [maxHoursWeek, setMaxHoursWeek] = React.useState("");
  const [minRestHours, setMinRestHours] = React.useState("");
  const [shiftTypesRaw, setShiftTypesRaw] = React.useState("");
  const [bizStart, setBizStart] = React.useState("");
  const [bizEnd, setBizEnd] = React.useState("");
  const [roleRates, setRoleRates] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSettings();
      setSettings(s);
      setOrgName(s.name);
      setIndustry(s.industry ?? "");
      setTimezone(s.defaultTimezone);
      setWeekStartDay(s.weekStartDay);
      const lr = s.laborRules;
      setMaxHoursDay(lr.maxHoursDay?.toString() ?? "");
      setMaxHoursWeek(lr.maxHoursWeek?.toString() ?? "");
      setMinRestHours(lr.minRestHours?.toString() ?? "");
      setShiftTypesRaw(lr.shiftTypes?.join(", ") ?? "");
      setBizStart(lr.businessHoursStart ?? "");
      setBizEnd(lr.businessHoursEnd ?? "");
      const rates: Record<string, string> = {};
      if (lr.roleRates) {
        for (const [k, v] of Object.entries(lr.roleRates)) {
          rates[k] = v.toString();
        }
      }
      setRoleRates(rates);
    } catch {
      toast.error("שגיאה בטעינת הגדרות");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const saveGeneral = async () => {
    setSaving(true);
    try {
      const s = await patchSettings({
        name: orgName,
        industry: industry || undefined,
        defaultTimezone: timezone,
        weekStartDay,
      });
      setSettings(s);
      toast.success("הגדרות נשמרו");
    } catch {
      toast.error("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const saveCompliance = async () => {
    setSaving(true);
    try {
      const rates: Record<string, number> = {};
      for (const [k, v] of Object.entries(roleRates)) {
        const n = parseFloat(v);
        if (!isNaN(n)) rates[k] = n;
      }
      const shiftTypes = shiftTypesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const lr: LaborRules = {};
      if (maxHoursDay) lr.maxHoursDay = parseFloat(maxHoursDay);
      if (maxHoursWeek) lr.maxHoursWeek = parseFloat(maxHoursWeek);
      if (minRestHours) lr.minRestHours = parseFloat(minRestHours);
      if (shiftTypes.length) lr.shiftTypes = shiftTypes;
      if (bizStart) lr.businessHoursStart = bizStart;
      if (bizEnd) lr.businessHoursEnd = bizEnd;
      if (Object.keys(rates).length) lr.roleRates = rates;
      const s = await patchSettings({ laborRules: lr });
      setSettings(s);
      toast.success("כללי עבודה נשמרו");
    } catch {
      toast.error("שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">הגדרות</h1>
        <p className="text-sm text-muted-foreground">
          הגדר את העסק שלך — תפקידים, כללי עבודה, ופרמטרים לבניית הסידור.
        </p>
      </div>

      {/* Tab bar (desktop) */}
      <div
        className="hidden sm:flex gap-1 rounded-lg bg-muted p-1"
        role="tablist"
        aria-label="הגדרות"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Mobile tab pills (horizontal scroll) */}
      <div className="sm:hidden -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-2 pb-1 min-w-min" role="tablist" aria-label="הגדרות">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`tabpanel-${t.id}`}
              id={`tab-mobile-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap touch-target ${
                tab === t.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "general" && (
        <div role="tabpanel" id="tabpanel-general" aria-labelledby="tab-general">
          <GeneralTab
            settings={settings}
            orgName={orgName}
            setOrgName={setOrgName}
            industry={industry}
            setIndustry={setIndustry}
            timezone={timezone}
            setTimezone={setTimezone}
            weekStartDay={weekStartDay}
            setWeekStartDay={setWeekStartDay}
            saving={saving}
            onSave={saveGeneral}
          />
        </div>
      )}

      {tab === "roles" && (
        <div role="tabpanel" id="tabpanel-roles" aria-labelledby="tab-roles">
          <RolesTab settings={settings} setSettings={setSettings} />
        </div>
      )}

      {tab === "locations" && (
        <div role="tabpanel" id="tabpanel-locations" aria-labelledby="tab-locations">
          <LocationsTab settings={settings} setSettings={setSettings} />
        </div>
      )}

      {tab === "compliance" && (
        <div role="tabpanel" id="tabpanel-compliance" aria-labelledby="tab-compliance">
          <ComplianceTab
            settings={settings}
            maxHoursDay={maxHoursDay}
            setMaxHoursDay={setMaxHoursDay}
            maxHoursWeek={maxHoursWeek}
            setMaxHoursWeek={setMaxHoursWeek}
            minRestHours={minRestHours}
            setMinRestHours={setMinRestHours}
            shiftTypesRaw={shiftTypesRaw}
            setShiftTypesRaw={setShiftTypesRaw}
            bizStart={bizStart}
            setBizStart={setBizStart}
            bizEnd={bizEnd}
            setBizEnd={setBizEnd}
            roleRates={roleRates}
            setRoleRates={setRoleRates}
            saving={saving}
            onSave={saveCompliance}
          />
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <SettingsContent />
      </AppShell>
    </AuthGuard>
  );
}
