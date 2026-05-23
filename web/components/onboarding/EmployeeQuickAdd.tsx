"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";

export interface ParsedEmployeeRow {
  fullName: string;
  phone?: string;
  role?: string;
}

interface EmployeeQuickAddProps {
  /** Fires whenever the parsed list changes. */
  onChange?: (state: { employees: ParsedEmployeeRow[]; isValid: boolean }) => void;
  initialValue?: string;
  placeholder?: string;
}

/**
 * Parse a free-form textarea. Each non-empty line is one employee.
 * Accepted separators: comma, tab, en-dash, hyphen surrounded by spaces.
 * Columns (in order): שם, טלפון, תפקיד.
 */
function parseRows(raw: string): ParsedEmployeeRow[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map<ParsedEmployeeRow>((line) => {
      const cols = line
        .split(/\s*[,\t–]\s*| - /)
        .map((c) => c.trim())
        .filter(Boolean);
      const [fullName, phone, role] = cols;
      return {
        fullName: fullName ?? line,
        ...(phone ? { phone } : {}),
        ...(role ? { role } : {}),
      };
    })
    .filter((r) => r.fullName.length >= 2);
}

export function EmployeeQuickAdd({
  onChange,
  initialValue = "",
  placeholder = "שם, טלפון, תפקיד — שורה אחת לכל עובד",
}: EmployeeQuickAddProps) {
  const [text, setText] = React.useState(initialValue);
  const [employees, setEmployees] = React.useState<ParsedEmployeeRow[]>(() =>
    parseRows(initialValue),
  );

  const commit = React.useCallback(
    (next: string) => {
      const parsed = parseRows(next);
      setEmployees(parsed);
      onChange?.({ employees: parsed, isValid: parsed.length > 0 });
    },
    [onChange],
  );

  React.useEffect(() => {
    // Fire initial state to parent.
    onChange?.({ employees, isValid: employees.length > 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeChip = (idx: number) => {
    const next = employees.filter((_, i) => i !== idx);
    setEmployees(next);
    // Rebuild textarea from the remaining rows.
    const rebuilt = next
      .map((e) =>
        [e.fullName, e.phone, e.role].filter(Boolean).join(", "),
      )
      .join("\n");
    setText(rebuilt);
    onChange?.({ employees: next, isValid: next.length > 0 });
  };

  return (
    <div className="space-y-2" dir="rtl">
      <Label htmlFor="employee-quick-add">עובדים</Label>
      <textarea
        id="employee-quick-add"
        rows={5}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
      />

      {employees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {employees.map((e, idx) => (
            <span
              key={`${e.fullName}-${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-300"
            >
              <span>{e.fullName}</span>
              {e.role && (
                <span className="text-indigo-500/70 dark:text-indigo-300/70">
                  · {e.role}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeChip(idx)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-500/20"
                aria-label={`הסר את ${e.fullName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {employees.length === 0
          ? "אפשר להזין כל עובד בשורה נפרדת — נזהה את השם, הטלפון והתפקיד אוטומטית."
          : `${employees.length} עובדים זוהו`}
      </p>
    </div>
  );
}
