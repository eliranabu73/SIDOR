"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DayPartEditor } from "./DayPartEditor";
import { FixedPeoplePicker } from "./FixedPeoplePicker";
import {
  fetchSettings,
  fetchEmployees,
  fetchWeeklyTemplates,
  fetchEmployeePreferences,
  saveEmployeePreferences,
  createWeeklyTemplate,
  updateWeeklyTemplate,
} from "@/lib/api";
import {
  DEFAULT_TEMPLATE_NAME,
  presetDayParts,
  fromWeeklyTemplate,
  toWeeklyTemplatePayload,
  toEmployeePrefUpdates,
  type RulesState,
  type DayPart,
  type FixedAssignment,
} from "@/lib/rules-mapping";

type Props = {
  mode: "onboarding" | "settings";
  primaryLabel?: string;
  onSaved?: () => void;
};

const DEFAULT_ACTIVE_DAYS = [0, 1, 2, 3, 4]; // Sun–Thu

function readActiveDays(laborRules: unknown): number[] {
  const raw = (laborRules as Record<string, unknown> | null)?.["activeDaysOfWeek"];
  if (Array.isArray(raw) && raw.every((n) => typeof n === "number")) {
    return raw as number[];
  }
  return DEFAULT_ACTIVE_DAYS;
}

function windowsValid(parts: DayPart[]): boolean {
  return parts.every((p) => p.start && p.end && p.start < p.end && p.headcount >= 1);
}

export function RulesWizard({ mode, primaryLabel, onSaved }: Props) {
  const qc = useQueryClient();

  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: fetchSettings, staleTime: 30_000 });
  const employeesQ = useQuery({ queryKey: ["employees"], queryFn: fetchEmployees, staleTime: 30_000 });
  const templatesQ = useQuery({
    queryKey: ["weekly-templates"],
    queryFn: fetchWeeklyTemplates,
    staleTime: 30_000,
  });

  const loading = settingsQ.isLoading || employeesQ.isLoading || templatesQ.isLoading;

  const [state, setState] = React.useState<RulesState | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Initialise wizard state once data is ready: edit the existing canonical
  // template if present, otherwise seed from industry presets.
  React.useEffect(() => {
    if (state || loading) return;
    const settings = settingsQ.data;
    const templates = templatesQ.data ?? [];
    if (!settings) return;

    const activeDays = readActiveDays(settings.laborRules);
    const canonical =
      templates.find((t) => t.name === DEFAULT_TEMPLATE_NAME) ??
      templates.find((t) => t.isActive) ??
      templates[0];

    if (canonical && canonical.shifts.length > 0) {
      const recovered = fromWeeklyTemplate(canonical);
      // Prefer the org's declared active days if the template lost some.
      setState({ ...recovered, activeDays: recovered.activeDays.length ? recovered.activeDays : activeDays });
    } else {
      setState({
        dayParts: presetDayParts(settings.industry),
        activeDays,
        fixed: [],
      });
    }
  }, [state, loading, settingsQ.data, templatesQ.data]);

  const employees = React.useMemo(
    () => (employeesQ.data ?? []).map((e) => ({ id: e.id, fullName: e.fullName })),
    [employeesQ.data],
  );

  const setDayParts = (dayParts: DayPart[]) =>
    setState((s) => (s ? { ...s, dayParts } : s));
  const setFixed = (fixed: FixedAssignment[]) =>
    setState((s) => (s ? { ...s, fixed } : s));

  const canSave =
    !!state &&
    state.dayParts.length >= 1 &&
    state.activeDays.length >= 1 &&
    windowsValid(state.dayParts);

  const save = async () => {
    if (!state || !canSave) return;
    setSaving(true);
    try {
      const timezone = settingsQ.data?.defaultTimezone;
      const payload = toWeeklyTemplatePayload(state, {
        timezone,
        name: DEFAULT_TEMPLATE_NAME,
      });

      const templates = templatesQ.data ?? [];
      const canonical =
        templates.find((t) => t.name === DEFAULT_TEMPLATE_NAME) ??
        templates.find((t) => t.isActive) ??
        templates[0];

      if (canonical) {
        await updateWeeklyTemplate(canonical.id, payload);
      } else {
        await createWeeklyTemplate(payload);
      }

      // Soft preferences for fixed people. Merge onto current prefs so we never
      // clobber unrelated fields. Only fixed employees are touched (small set).
      const prefUpdates = toEmployeePrefUpdates(state);
      await Promise.all(
        prefUpdates.map(async (u) => {
          const current = await fetchEmployeePreferences(u.employeeId).catch(() => null);
          await saveEmployeePreferences(u.employeeId, {
            ...(current ?? {}),
            prefersMornings: u.prefersMornings,
            prefersEvenings: u.prefersEvenings,
          });
        }),
      );

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["weekly-templates"] }),
        qc.invalidateQueries({ queryKey: ["onboarding-progress"] }),
      ]);

      toast.success("הכללים נשמרו");
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שמירת הכללים נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !state) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <header className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">חלקי היום וכמה אנשים</h2>
            <p className="text-sm text-muted-foreground">
              הגדר כל חלק יום (בוקר / ערב…), את השעות שלו, וכמה אנשים צריך. זה חוזר
              על עצמו בכל יום פעיל — תוכל לערוך מתי שתרצה.
            </p>
          </div>
        </header>
        <DayPartEditor dayParts={state.dayParts} onChange={setDayParts} />
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-lg font-semibold">אנשים קבועים</h2>
          <p className="text-sm text-muted-foreground">
            מי עובד תמיד באותו חלק יום? למשל "אבי — בוקר", "מוטי — ערב". הם ישובצו
            אוטומטית בכל שבוע, והמערכת תעדיף לשבץ אותם בחלק היום הזה.
          </p>
        </header>
        <FixedPeoplePicker
          employees={employees}
          dayParts={state.dayParts}
          activeDays={state.activeDays}
          fixed={state.fixed}
          onChange={setFixed}
        />
      </section>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="glow" onClick={save} disabled={!canSave || saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {primaryLabel ?? (mode === "onboarding" ? "שמור והמשך" : "שמור כללים")}
        </Button>
      </div>
    </div>
  );
}
