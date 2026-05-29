"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Building2, MapPin, Users } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import {
  fetchSettings,
  patchSettings,
  uploadOrgLogo,
  removeOrgLogo,
  type OrgSettings,
  type LaborRules,
} from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

type Tab = "general" | "branches-roles" | "managers";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "כללי", icon: <Building2 className="h-4 w-4" /> },
  {
    id: "branches-roles",
    label: "סניפים ותפקידים",
    icon: <MapPin className="h-4 w-4" />,
  },
  { id: "managers", label: "הגדרת מנהלים", icon: <Users className="h-4 w-4" /> },
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
const BranchesRolesTab = dynamic(() => import("./BranchesRolesTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});
const ManagersTab = dynamic(() => import("./ManagersTab"), {
  ssr: false,
  loading: () => <TabSkeleton />,
});

function SettingsContent() {
  const [tab, setTab] = React.useState<Tab>("general");
  const [settings, setSettings] = React.useState<OrgSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [logoUploading, setLogoUploading] = React.useState(false);

  // General — org basics
  const [orgName, setOrgName] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [timezone, setTimezone] = React.useState("Asia/Jerusalem");
  const [weekStartDay, setWeekStartDay] = React.useState(0);

  // General — labor rules (formerly compliance tab)
  const [maxHoursDay, setMaxHoursDay] = React.useState("");
  const [maxHoursWeek, setMaxHoursWeek] = React.useState("");
  const [minRestHours, setMinRestHours] = React.useState("");
  const [bizStart, setBizStart] = React.useState("");
  const [bizEnd, setBizEnd] = React.useState("");

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
      setBizStart(lr.businessHoursStart ?? "");
      setBizEnd(lr.businessHoursEnd ?? "");
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
      toast.error("שמירת ההגדרות נכשלה");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = React.useCallback(async (file: File) => {
    if (!settings?.id) return;
    setLogoUploading(true);
    try {
      const updated = await uploadOrgLogo(settings.id, file, getSupabase);
      setSettings(updated);
      toast.success("הלוגו הועלה בהצלחה");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "העלאת הלוגו נכשלה");
    } finally {
      setLogoUploading(false);
    }
  }, [settings?.id]);

  const handleLogoRemove = React.useCallback(async () => {
    if (!settings?.id) return;
    setLogoUploading(true);
    try {
      const updated = await removeOrgLogo(settings.id, settings.logoUrl ?? null, getSupabase);
      setSettings(updated);
      toast.success("הלוגו הוסר");
    } catch {
      toast.error("הסרת הלוגו נכשלה");
    } finally {
      setLogoUploading(false);
    }
  }, [settings?.id, settings?.logoUrl]);

  const saveLaborRules = async () => {
    setSaving(true);
    try {
      // Preserve any existing labor-rule fields we don't surface in the UI
      // (e.g. roleRates, shiftTypes) by merging on top of the loaded snapshot.
      const lr: LaborRules = { ...(settings?.laborRules ?? {}) };
      if (maxHoursDay) lr.maxHoursDay = parseFloat(maxHoursDay);
      else delete lr.maxHoursDay;
      if (maxHoursWeek) lr.maxHoursWeek = parseFloat(maxHoursWeek);
      else delete lr.maxHoursWeek;
      if (minRestHours) lr.minRestHours = parseFloat(minRestHours);
      else delete lr.minRestHours;
      if (bizStart) lr.businessHoursStart = bizStart;
      else delete lr.businessHoursStart;
      if (bizEnd) lr.businessHoursEnd = bizEnd;
      else delete lr.businessHoursEnd;
      const s = await patchSettings({ laborRules: lr });
      setSettings(s);
      toast.success("שעות פעילות נשמרו");
    } catch {
      toast.error("שמירת שעות הפעילות נכשלה");
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
          הגדר את העסק שלך — תפקידים, סניפים, ופרמטרים לבניית הסידור.
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
            bizStart={bizStart}
            setBizStart={setBizStart}
            bizEnd={bizEnd}
            setBizEnd={setBizEnd}
            maxHoursDay={maxHoursDay}
            setMaxHoursDay={setMaxHoursDay}
            maxHoursWeek={maxHoursWeek}
            setMaxHoursWeek={setMaxHoursWeek}
            minRestHours={minRestHours}
            setMinRestHours={setMinRestHours}
            saving={saving}
            onSave={saveGeneral}
            onSaveLaborRules={saveLaborRules}
            onLogoUpload={handleLogoUpload}
            onLogoRemove={handleLogoRemove}
            logoUploading={logoUploading}
          />
        </div>
      )}

      {tab === "branches-roles" && (
        <div
          role="tabpanel"
          id="tabpanel-branches-roles"
          aria-labelledby="tab-branches-roles"
        >
          <BranchesRolesTab settings={settings} setSettings={setSettings} />
        </div>
      )}

      {tab === "managers" && (
        <div role="tabpanel" id="tabpanel-managers" aria-labelledby="tab-managers">
          <ManagersTab />
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
