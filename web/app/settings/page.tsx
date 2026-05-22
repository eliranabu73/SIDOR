"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Building2,
  ChevronRight,
  MapPin,
  PlusCircle,
  Save,
  Shield,
  Tag,
  Trash2,
} from "lucide-react";
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
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/auth/AuthGuard";
import {
  fetchSettings,
  patchSettings,
  updateOrgRole,
  deleteOrgRole,
  updateOrgLocation,
  deleteOrgLocation,
  createRole,
  createLocation,
  type OrgSettings,
  type OrgRole,
  type OrgLocation,
  type LaborRules,
} from "@/lib/api";

type Tab = "general" | "roles" | "locations" | "compliance";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "כללי", icon: <Building2 className="h-4 w-4" /> },
  { id: "roles", label: "תפקידים", icon: <Tag className="h-4 w-4" /> },
  { id: "locations", label: "סניפים", icon: <MapPin className="h-4 w-4" /> },
  { id: "compliance", label: "כללי עבודה", icon: <Shield className="h-4 w-4" /> },
];

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

  // Roles / Locations edit state
  const [editingRole, setEditingRole] = React.useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = React.useState("");
  const [newRoleName, setNewRoleName] = React.useState("");

  const [editingLocation, setEditingLocation] = React.useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = React.useState("");
  const [newLocationName, setNewLocationName] = React.useState("");

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

  const saveRole = async (id: string) => {
    try {
      const updated = await updateOrgRole(id, editingRoleName);
      setSettings((s) =>
        s
          ? { ...s, roles: s.roles.map((r) => (r.id === id ? { ...r, name: updated.name } : r)) }
          : s,
      );
      setEditingRole(null);
      toast.success("תפקיד עודכן");
    } catch {
      toast.error("שגיאה בעדכון");
    }
  };

  const doDeleteRole = async (role: OrgRole) => {
    try {
      await deleteOrgRole(role.id);
      setSettings((s) => (s ? { ...s, roles: s.roles.filter((r) => r.id !== role.id) } : s));
      toast.success("תפקיד נמחק");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה במחיקה";
      toast.error(msg);
    }
  };

  const addRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const r = await createRole({ name: newRoleName.trim() });
      const newRole: OrgRole = { id: r.id, name: r.name, description: null };
      setSettings((s) => (s ? { ...s, roles: [...s.roles, newRole] } : s));
      setNewRoleName("");
      toast.success("תפקיד נוצר");
    } catch {
      toast.error("שגיאה ביצירה");
    }
  };

  const saveLocation = async (id: string) => {
    try {
      const updated = await updateOrgLocation(id, editingLocationName);
      setSettings((s) =>
        s
          ? {
              ...s,
              locations: s.locations.map((l) =>
                l.id === id ? { ...l, name: updated.name } : l,
              ),
            }
          : s,
      );
      setEditingLocation(null);
      toast.success("סניף עודכן");
    } catch {
      toast.error("שגיאה בעדכון");
    }
  };

  const doDeleteLocation = async (loc: OrgLocation) => {
    try {
      await deleteOrgLocation(loc.id);
      setSettings((s) =>
        s ? { ...s, locations: s.locations.filter((l) => l.id !== loc.id) } : s,
      );
      toast.success("סניף נמחק");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה במחיקה";
      toast.error(msg);
    }
  };

  const addLocation = async () => {
    if (!newLocationName.trim()) return;
    try {
      const l = await createLocation({ name: newLocationName.trim() });
      const newLoc: OrgLocation = { id: l.id, name: l.name, timezone: l.timezone ?? null, address: null };
      setSettings((s) => (s ? { ...s, locations: [...s.locations, newLoc] } : s));
      setNewLocationName("");
      toast.success("סניף נוצר");
    } catch {
      toast.error("שגיאה ביצירה");
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

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* General tab */}
      {tab === "general" && (
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
              <Input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="מסעדה, מרפאה, בית מלון, מחסן, קליניקה..."
              />
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
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
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
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
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

            <Button variant="glow" onClick={saveGeneral} disabled={saving} className="w-full">
              <Save className="me-2 h-4 w-4" />
              {saving ? "שומר…" : "שמור שינויים"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Roles tab */}
      {tab === "roles" && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>תפקידים</CardTitle>
            <CardDescription>
              הגדר את תפקידי העובדים בעסק — מלצר, טבח, מנהל, קופאי, כל מה שצריך.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings?.roles.length === 0 && (
              <p className="text-sm text-muted-foreground">אין תפקידים עדיין.</p>
            )}
            {settings?.roles.map((role) => (
              <div
                key={role.id}
                className="flex items-center gap-2 rounded-md border border-border p-2"
              >
                {editingRole === role.id ? (
                  <>
                    <Input
                      value={editingRoleName}
                      onChange={(e) => setEditingRoleName(e.target.value)}
                      className="h-8 flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveRole(role.id);
                        if (e.key === "Escape") setEditingRole(null);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="glow"
                      onClick={() => void saveRole(role.id)}
                      className="h-8"
                    >
                      שמור
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingRole(null)}
                      className="h-8"
                    >
                      ביטול
                    </Button>
                  </>
                ) : (
                  <>
                    <ChevronRight className="h-4 w-4 shrink-0 text-indigo-500" />
                    <span className="flex-1 text-sm font-medium">{role.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingRole(role.id);
                        setEditingRoleName(role.name);
                      }}
                      className="h-8"
                    >
                      ערוך
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void doDeleteRole(role)}
                      className="h-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Input
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="שם תפקיד חדש"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addRole();
                }}
              />
              <Button variant="outline" onClick={addRole} disabled={!newRoleName.trim()}>
                <PlusCircle className="me-1 h-4 w-4" />
                הוסף
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locations tab */}
      {tab === "locations" && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>סניפים / מיקומים</CardTitle>
            <CardDescription>הגדר את הסניפים שבהם מנוהל הסידור.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {settings?.locations.length === 0 && (
              <p className="text-sm text-muted-foreground">אין סניפים עדיין.</p>
            )}
            {settings?.locations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center gap-2 rounded-md border border-border p-2"
              >
                {editingLocation === loc.id ? (
                  <>
                    <Input
                      value={editingLocationName}
                      onChange={(e) => setEditingLocationName(e.target.value)}
                      className="h-8 flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveLocation(loc.id);
                        if (e.key === "Escape") setEditingLocation(null);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="glow"
                      onClick={() => void saveLocation(loc.id)}
                      className="h-8"
                    >
                      שמור
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingLocation(null)}
                      className="h-8"
                    >
                      ביטול
                    </Button>
                  </>
                ) : (
                  <>
                    <MapPin className="h-4 w-4 shrink-0 text-cyan-500" />
                    <span className="flex-1 text-sm font-medium">{loc.name}</span>
                    {loc.timezone && (
                      <span className="text-xs text-muted-foreground">{loc.timezone}</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingLocation(loc.id);
                        setEditingLocationName(loc.name);
                      }}
                      className="h-8"
                    >
                      ערוך
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void doDeleteLocation(loc)}
                      className="h-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="שם סניף חדש"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addLocation();
                }}
              />
              <Button variant="outline" onClick={addLocation} disabled={!newLocationName.trim()}>
                <PlusCircle className="me-1 h-4 w-4" />
                הוסף
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance tab */}
      {tab === "compliance" && (
        <div className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>הגבלות שעות</CardTitle>
              <CardDescription>
                מגבלות חוקיות ועסקיות — ינוסו אוטומטית בבניית הסידור.
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

          <Button variant="glow" onClick={saveCompliance} disabled={saving} className="w-full">
            <Save className="me-2 h-4 w-4" />
            {saving ? "שומר…" : "שמור כללי עבודה"}
          </Button>
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
