"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabase } from "@/lib/supabase";
import {
  ApiError,
  createLocation,
  fetchSettings,
  patchSettings,
} from "@/lib/api";
import { INDUSTRY_OPTIONS } from "@/lib/industries";
import { useOnboardingProgress } from "@/lib/onboarding-progress";
import { useWizardNav } from "../layout";

const TIMEZONES = [
  { value: "Asia/Jerusalem", label: "ירושלים (Asia/Jerusalem)" },
  { value: "Europe/London", label: "לונדון (Europe/London)" },
  { value: "Europe/Berlin", label: "ברלין (Europe/Berlin)" },
  { value: "America/New_York", label: "ניו יורק (America/New_York)" },
  { value: "America/Los_Angeles", label: "לוס אנג'לס (America/Los_Angeles)" },
];

const DAYS_OF_WEEK: { value: number; short: string; long: string }[] = [
  { value: 0, short: "א", long: "ראשון" },
  { value: 1, short: "ב", long: "שני" },
  { value: 2, short: "ג", long: "שלישי" },
  { value: 3, short: "ד", long: "רביעי" },
  { value: 4, short: "ה", long: "חמישי" },
  { value: 5, short: "ו", long: "שישי" },
  { value: 6, short: "ש", long: "שבת" },
];

interface QuickBootstrapResult {
  organizationId: string;
  scheduleId: string;
}

async function postQuickBootstrap(payload: {
  name: string;
  industry: string;
  employeeCount: number;
}): Promise<QuickBootstrapResult> {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (data.session?.access_token) {
    headers["authorization"] = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${apiUrl}/v1/onboarding/quick-bootstrap`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as QuickBootstrapResult;
}

export default function BusinessStepPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const progress = useOnboardingProgress();

  const [orgName, setOrgName] = React.useState("");
  const [industry, setIndustry] = React.useState<string>("restaurant");
  const [timezone, setTimezone] = React.useState("Asia/Jerusalem");
  const [branchName, setBranchName] = React.useState("");
  const [bizStart, setBizStart] = React.useState("09:00");
  const [bizEnd, setBizEnd] = React.useState("18:00");
  const [activeDays, setActiveDays] = React.useState<number[]>([0, 1, 2, 3, 4]);
  const [saving, setSaving] = React.useState(false);

  // Hydrate defaults once settings load (only if user already had an org).
  const hydratedRef = React.useRef(false);
  React.useEffect(() => {
    if (hydratedRef.current) return;
    if (!progress.settings) return;
    hydratedRef.current = true;
    const s = progress.settings;
    setOrgName(s.name);
    if (s.industry) setIndustry(s.industry);
    if (s.defaultTimezone) setTimezone(s.defaultTimezone);
    if (s.laborRules.businessHoursStart) {
      setBizStart(s.laborRules.businessHoursStart);
    }
    if (s.laborRules.businessHoursEnd) {
      setBizEnd(s.laborRules.businessHoursEnd);
    }
    const lrUnknown = s.laborRules as unknown as {
      activeDaysOfWeek?: number[];
    };
    if (Array.isArray(lrUnknown.activeDaysOfWeek)) {
      setActiveDays(lrUnknown.activeDaysOfWeek);
    }
    if (s.locations.length > 0) {
      setBranchName(s.locations[0]!.name);
    }
  }, [progress.settings]);

  const orgAlreadyExists = progress.hasOrg;

  const canAdvance =
    orgName.trim().length >= 2 &&
    branchName.trim().length >= 2 &&
    /^\d{2}:\d{2}$/.test(bizStart) &&
    /^\d{2}:\d{2}$/.test(bizEnd) &&
    activeDays.length > 0 &&
    !saving;

  const onNext = React.useCallback(async () => {
    setSaving(true);
    try {
      // 1. Ensure org exists. If not, quick-bootstrap creates org + default
      // location + empty schedule + initial roles.
      if (!orgAlreadyExists) {
        await postQuickBootstrap({
          name: orgName.trim(),
          industry,
          employeeCount: 1,
        });
        // Refresh JWT so the new organization_id claim arrives.
        try {
          const supabase = getSupabase();
          await supabase.auth.refreshSession();
        } catch {
          /* ignored — backend resolves org via DB lookup if claim missing */
        }
      }

      // 2. Re-fetch settings so we know whether the location quick-bootstrap
      // created matches the name the user typed.
      const fresh = await fetchSettings();

      // 3. Patch org name + industry + timezone + business hours.
      await patchSettings({
        name: orgName.trim(),
        industry,
        defaultTimezone: timezone,
        laborRules: {
          ...fresh.laborRules,
          businessHoursStart: bizStart,
          businessHoursEnd: bizEnd,
          // activeDaysOfWeek is not yet a typed LaborRules field — backend
          // accepts arbitrary JSON in laborRulesJsonb so we widen here.
          ...({ activeDaysOfWeek: activeDays } as unknown as object),
        },
      });

      // 4. Ensure first location exists / matches the typed branch name.
      if (fresh.locations.length === 0) {
        await createLocation({ name: branchName.trim(), timezone });
      }

      // 5. Invalidate the progress hook so the next step sees fresh data.
      await qc.invalidateQueries({ queryKey: ["onboarding-progress"] });

      router.push("/onboarding/setup/employees");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שמירה נכשלה";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [
    activeDays,
    bizEnd,
    bizStart,
    branchName,
    industry,
    orgAlreadyExists,
    orgName,
    qc,
    router,
    timezone,
  ]);

  useWizardNav({
    canAdvance,
    onNext,
    nextLabel: saving ? "שומר…" : "הבא",
  });

  const toggleDay = (day: number) => {
    setActiveDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">פרטי העסק</h1>
          <p className="text-sm text-muted-foreground">
            כמה פרטים בסיסיים שיעזרו לבנות סידור מותאם.
          </p>
        </div>
      </header>

      <div className="space-y-1">
        <Label htmlFor="orgName">שם העסק</Label>
        <Input
          id="orgName"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="לדוגמה: קפה הבוקר"
          disabled={orgAlreadyExists}
        />
        {orgAlreadyExists && (
          <p className="text-xs text-muted-foreground">
            שם העסק נקבע ביצירת הארגון ולא ניתן לשנות אותו דרך האשף.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="industry">תחום</Label>
          <select
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
          >
            {INDUSTRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="branchName">שם הסניף הראשי</Label>
        <Input
          id="branchName"
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder="לדוגמה: סניף מרכזי"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="bizStart">שעת פתיחה</Label>
          <Input
            id="bizStart"
            type="time"
            value={bizStart}
            onChange={(e) => setBizStart(e.target.value)}
            dir="ltr"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bizEnd">שעת סגירה</Label>
          <Input
            id="bizEnd"
            type="time"
            value={bizEnd}
            onChange={(e) => setBizEnd(e.target.value)}
            dir="ltr"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>ימי פעילות</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map((d) => {
            const on = activeDays.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDay(d.value)}
                aria-pressed={on}
                aria-label={d.long}
                className={`flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors ${
                  on
                    ? "border-indigo-500 bg-indigo-500 text-white shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:border-indigo-400 hover:text-foreground"
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
        {activeDays.length === 0 && (
          <p className="text-xs text-destructive">בחר לפחות יום אחד.</p>
        )}
      </div>

      <div className="border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={onNext}
          disabled={!canAdvance}
        >
          {saving ? "שומר…" : "שמור והמשך"}
        </Button>
      </div>
    </div>
  );
}
