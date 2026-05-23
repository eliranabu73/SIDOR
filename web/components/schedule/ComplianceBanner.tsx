"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import {
  getComplianceReport,
  type ComplianceReport,
  type ComplianceViolation,
} from "@/lib/api";

interface ComplianceBannerProps {
  scheduleId: string | null | undefined;
}

/**
 * WS-E: IL Compliance Engine — banner above the schedule grid.
 *
 * - Green pill when the schedule is compliant.
 * - Red banner with expandable list when violations exist.
 * - Each violation row carries `data-shift-id` for cross-component highlighting.
 */
export function ComplianceBanner({ scheduleId }: ComplianceBannerProps) {
  const [expanded, setExpanded] = React.useState(false);

  const query = useQuery<ComplianceReport>({
    queryKey: ["compliance-report", scheduleId],
    queryFn: () => getComplianceReport(scheduleId as string),
    enabled: Boolean(scheduleId),
    staleTime: 30_000,
  });

  if (!scheduleId) return null;
  if (query.isLoading || !query.data) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-3 my-2 h-9 rounded-md border bg-muted/40 animate-pulse"
      />
    );
  }

  const violations = query.data.violations.filter(
    (v) => v.severity !== "info",
  );

  if (violations.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-3 my-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
        dir="rtl"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        <span>הסידור תואם לחוק עבודה ומנוחה</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mx-3 my-2 rounded-md border border-red-300/70 bg-red-50 text-red-900 dark:border-red-400/40 dark:bg-red-500/10 dark:text-red-100"
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start"
        aria-expanded={expanded}
        aria-controls="compliance-violations-list"
      >
        <span className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {violations.length} חריגות חוק עבודה
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <ul
          id="compliance-violations-list"
          className="border-t border-red-200/70 px-3 py-2 space-y-1 text-sm dark:border-red-400/30"
        >
          {violations.map((v, i) => (
            <ViolationRow key={`${v.ruleCode}-${i}`} violation={v} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ViolationRow({ violation }: { violation: ComplianceViolation }) {
  return (
    <li
      data-shift-id={violation.shiftId ?? undefined}
      data-rule-code={violation.ruleCode}
      data-severity={violation.severity}
      className="flex items-start gap-2"
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
          violation.severity === "blocking" ? "bg-red-600" : "bg-amber-500"
        }`}
      />
      <span className="leading-snug">{violation.message}</span>
    </li>
  );
}
