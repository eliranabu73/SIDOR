"use client";

import * as React from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Coins,
  Sunrise,
  UserPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboardingProgress } from "@/lib/onboarding-progress";
import { BusinessHoursDialog } from "./dialogs/BusinessHoursDialog";
import { QuickAddEmployeesDialog } from "./dialogs/QuickAddEmployeesDialog";
import { ShiftTemplatesDialog } from "./dialogs/ShiftTemplatesDialog";
import { EmployeeRateMatrixDialog } from "./dialogs/EmployeeRateMatrixDialog";

const DISMISSED_KEY = "setupChecklistDismissed";
const SKIPPED_KEY = "wizardSkipped";

type DialogKey = "business" | "employees" | "shifts" | "rates" | null;

/**
 * Re-export so the page can mount a "show checklist" button that clears the
 * dismissal flag. Keeps the storage key co-located with the component.
 */
export function clearSetupChecklistDismissal() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(DISMISSED_KEY);
    } catch {
      /* ignored */
    }
  }
}

export function isSetupChecklistDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function SetupChecklist() {
  const progress = useOnboardingProgress();
  const [dismissed, setDismissed] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openDialog, setOpenDialog] = React.useState<DialogKey>(null);

  // Hydrate dismissed state from localStorage (avoid SSR mismatch).
  React.useEffect(() => {
    setHydrated(true);
    setDismissed(isSetupChecklistDismissed());

    // Listen for cross-component clears (e.g. "show checklist" button).
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISMISSED_KEY) {
        setDismissed(e.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const employees = progress.employees ?? [];
  const employeesCount = employees.length;
  const hasEnoughEmployees = employeesCount >= 3;
  const employeesWithoutRate = employees.filter(
    (e) => !e.hourlyRate || e.hourlyRate === 0,
  );
  const ratesDone = employeesCount > 0 && employeesWithoutRate.length === 0;

  // Business-hours sub-condition (uses same labor rule the hook checks).
  const businessHoursDone = Boolean(
    progress.settings?.laborRules?.businessHoursStart &&
      progress.settings?.laborRules?.businessHoursEnd,
  );
  const branchDone = (progress.settings?.locations.length ?? 0) > 0;

  type Item = {
    key: DialogKey;
    label: string;
    icon: React.ReactNode;
    done: boolean;
  };

  const items: Item[] = [
    {
      key: "business",
      label: "הגדר עסק וסניף ראשי",
      icon: <Building2 className="h-4 w-4" />,
      done: branchDone,
    },
    {
      key: "employees",
      label: `הוסף עובדים (לפחות 3) — ${employeesCount}/3`,
      icon: <UserPlus className="h-4 w-4" />,
      done: hasEnoughEmployees,
    },
    {
      key: "business",
      label: "הגדר שעות פעילות",
      icon: <Clock className="h-4 w-4" />,
      done: businessHoursDone,
    },
    {
      key: "shifts",
      label: "צור תבניות משמרת",
      icon: <Sunrise className="h-4 w-4" />,
      done: progress.shiftsDone,
    },
    {
      key: "rates",
      label:
        employeesWithoutRate.length > 0
          ? `הזן שכר לכל עובד (${employeesWithoutRate.length} חסרים)`
          : "הזן שכר לכל עובד",
      icon: <Coins className="h-4 w-4" />,
      done: ratesDone,
    },
  ];

  const totalSteps = items.length;
  const completedSteps = items.filter((i) => i.done).length;
  const allDone = completedSteps === totalSteps;

  // Auto-dismiss once everything is set up; also persist the wizard-skip flag
  // so the onboarding wizard doesn't pop back.
  React.useEffect(() => {
    if (!hydrated) return;
    if (allDone) {
      try {
        window.localStorage.setItem(SKIPPED_KEY, "true");
      } catch {
        /* ignored */
      }
    }
  }, [allDone, hydrated]);

  // Don't render until hydrated to avoid SSR/CSR flash; don't render when
  // dismissed, when loading, or when there's nothing to do.
  if (!hydrated) return null;
  if (progress.isLoading) return null;
  if (!progress.hasOrg) return null;
  if (dismissed) return null;
  if (allDone) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      /* ignored */
    }
    setDismissed(true);
  };

  const handleItemClick = (key: DialogKey) => {
    setMobileOpen(false);
    setOpenDialog(key);
  };

  const progressPct = (completedSteps / totalSteps) * 100;

  return (
    <>
      {/* Desktop floating card — bottom-start (visually right in RTL) */}
      <div
        className="hidden sm:block fixed bottom-4 start-4 z-40 w-80 max-w-[calc(100vw-2rem)]"
        role="complementary"
        aria-label="רשימת התקנה"
      >
        <div className="rounded-xl border bg-card/95 backdrop-blur shadow-lg overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
            <div className="inline-flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-indigo-500" />
              רשימת התקנה
            </div>
            <div className="inline-flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {completedSteps} מתוך {totalSteps} הושלמו
              </span>
              <button
                type="button"
                onClick={dismiss}
                aria-label="הסתר רשימת התקנה"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="h-1 bg-muted">
            <div
              className="h-1 bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <ul className="divide-y">
            {items.map((it, idx) => (
              <ChecklistRow
                key={`${it.label}-${idx}`}
                item={it}
                onOpen={() => handleItemClick(it.key)}
              />
            ))}
          </ul>
        </div>
      </div>

      {/* Mobile top banner — collapsible */}
      <div
        className="sm:hidden border-b bg-card"
        role="complementary"
        aria-label="רשימת התקנה"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex items-center gap-2 text-sm font-semibold flex-1 text-start"
            aria-expanded={mobileOpen}
            aria-controls="setup-checklist-mobile-list"
          >
            <ClipboardList className="h-4 w-4 text-indigo-500" />
            <span>
              התקנה: {completedSteps}/{totalSteps}
            </span>
            {mobileOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="הסתר רשימת התקנה"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-1 bg-muted">
          <div
            className="h-1 bg-gradient-to-r from-indigo-500 to-emerald-500 transition-[width] duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {mobileOpen && (
          <ul id="setup-checklist-mobile-list" className="divide-y border-t">
            {items.map((it, idx) => (
              <ChecklistRow
                key={`m-${it.label}-${idx}`}
                item={it}
                onOpen={() => handleItemClick(it.key)}
              />
            ))}
          </ul>
        )}
      </div>

      <BusinessHoursDialog
        open={openDialog === "business"}
        onOpenChange={(o) => setOpenDialog(o ? "business" : null)}
        settings={progress.settings}
      />
      <QuickAddEmployeesDialog
        open={openDialog === "employees"}
        onOpenChange={(o) => setOpenDialog(o ? "employees" : null)}
      />
      <ShiftTemplatesDialog
        open={openDialog === "shifts"}
        onOpenChange={(o) => setOpenDialog(o ? "shifts" : null)}
      />
      <EmployeeRateMatrixDialog
        open={openDialog === "rates"}
        onOpenChange={(o) => setOpenDialog(o ? "rates" : null)}
        employees={employees}
      />
    </>
  );
}

function ChecklistRow({
  item,
  onOpen,
}: {
  item: {
    key: DialogKey;
    label: string;
    icon: React.ReactNode;
    done: boolean;
  };
  onOpen: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
          item.done
            ? "border-emerald-500 bg-emerald-500 text-white scale-100"
            : "border-muted-foreground/40 bg-background text-muted-foreground"
        }`}
      >
        {item.done ? (
          <Check className="h-3.5 w-3.5 animate-in zoom-in duration-300" />
        ) : (
          item.icon
        )}
      </span>
      <span
        className={`flex-1 text-sm truncate ${
          item.done ? "text-muted-foreground line-through" : "text-foreground"
        }`}
      >
        {item.label}
      </span>
      {!item.done && (
        <Button size="sm" variant="outline" className="h-8" onClick={onOpen}>
          פתח
        </Button>
      )}
    </li>
  );
}
