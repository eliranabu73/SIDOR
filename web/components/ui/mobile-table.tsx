"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Column descriptor for {@link MobileTable}.
 *
 * @template T Row data type.
 */
export interface MobileTableColumn<T> {
  /** Header text shown on desktop `<th>` and as the `<dt>` label on mobile. */
  header: string;
  /** Cell renderer — receives the row, returns ReactNode (string, number, JSX). */
  accessor: (row: T) => React.ReactNode;
  /** Hide this column on mobile (still rendered on desktop). Default `false`. */
  mobileHidden?: boolean;
  /**
   * Show the `header` label before the value on mobile.
   * Set to `false` for full-width cells like action button rows. Default `true`.
   */
  mobileLabel?: boolean;
  /** Extra classes for the desktop `<td>`/`<th>` cell. */
  className?: string;
  /** Optional column-level alignment override. Default RTL `text-end`. */
  align?: "start" | "center" | "end";
}

export interface MobileTableProps<T> {
  /** Row data. */
  data: readonly T[];
  /** Column definitions. */
  columns: ReadonlyArray<MobileTableColumn<T>>;
  /** Stable key extractor. */
  keyFn: (row: T) => string | number;
  /** Tap/click handler on a row (applies on both mobile cards and desktop rows). */
  onRowClick?: (row: T) => void;
  /** Shown when `data` is empty. */
  emptyState?: React.ReactNode;
  /** Extra wrapper classes. */
  className?: string;
  /**
   * Breakpoint at which the layout flips from stacked-cards to `<table>`.
   * Tailwind prefix without colon. Default `"sm"`.
   */
  desktopBreakpoint?: "sm" | "md" | "lg";
}

/**
 * Responsive data table primitive.
 *
 * - On mobile (below `desktopBreakpoint`): each row renders as a tappable Card
 *   with `<dl>` label/value pairs. Touch target ≥64px.
 * - On desktop: standard semantic `<table>` with sticky-friendly `<thead>`.
 *
 * Use {@link MobileTable} for **browsable lists** (employees, time-off requests,
 * swaps). For a single primary "create" action, pair with
 * {@link import("./floating-action-button").FloatingActionButton} instead of
 * adding an action column.
 *
 * @example
 * ```tsx
 * <MobileTable
 *   data={employees}
 *   keyFn={(e) => e.id}
 *   columns={[
 *     { header: "שם", accessor: (e) => e.fullName },
 *     { header: "תפקיד", accessor: (e) => e.role },
 *     { header: "פעולות", accessor: (e) => <Button>...</Button>, mobileLabel: false },
 *   ]}
 *   onRowClick={(e) => router.push(`/employees/${e.id}`)}
 *   emptyState={<p>אין עובדים</p>}
 * />
 * ```
 */
export function MobileTable<T>({
  data,
  columns,
  keyFn,
  onRowClick,
  emptyState,
  className,
  desktopBreakpoint = "sm",
}: MobileTableProps<T>): React.ReactElement {
  if (data.length === 0 && emptyState) {
    return <div className={cn("py-12 text-center text-muted-foreground", className)}>{emptyState}</div>;
  }

  const hiddenBelow: Record<NonNullable<MobileTableProps<T>["desktopBreakpoint"]>, string> = {
    sm: "hidden sm:table",
    md: "hidden md:table",
    lg: "hidden lg:table",
  };
  const visibleBelow: Record<NonNullable<MobileTableProps<T>["desktopBreakpoint"]>, string> = {
    sm: "sm:hidden",
    md: "md:hidden",
    lg: "lg:hidden",
  };

  const alignClass = (a: MobileTableColumn<T>["align"]): string => {
    if (a === "center") return "text-center";
    if (a === "start") return "text-start";
    return "text-end";
  };

  const interactive = Boolean(onRowClick);

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile: stacked cards */}
      <ul className={cn("flex flex-col gap-2", visibleBelow[desktopBreakpoint])}>
        {data.map((row) => {
          const key = keyFn(row);
          const visibleCols = columns.filter((c) => !c.mobileHidden);
          return (
            <li key={key}>
              <div
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                onKeyDown={
                  interactive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick?.(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "rounded-lg border bg-card text-card-foreground shadow-sm p-4",
                  "min-h-16 flex flex-col gap-2",
                  interactive &&
                    "cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <dl className="flex flex-col gap-2">
                  {visibleCols.map((col, idx) => {
                    const showLabel = col.mobileLabel !== false;
                    return (
                      <div
                        key={`${String(key)}-${idx}`}
                        className={cn(
                          "flex gap-2",
                          showLabel ? "items-center justify-between" : "justify-end",
                        )}
                      >
                        {showLabel && (
                          <dt className="text-xs font-medium text-muted-foreground shrink-0">
                            {col.header}
                          </dt>
                        )}
                        <dd className={cn("text-sm text-foreground min-w-0", showLabel && "text-end")}>
                          {col.accessor(row)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: real table */}
      <table className={cn("w-full caption-bottom text-sm", hiddenBelow[desktopBreakpoint])}>
        <thead className="border-b">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={`h-${idx}`}
                scope="col"
                className={cn(
                  "h-10 px-3 text-end align-middle text-xs font-medium text-muted-foreground",
                  alignClass(col.align),
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const key = keyFn(row);
            return (
              <tr
                key={key}
                onClick={interactive ? () => onRowClick?.(row) : undefined}
                className={cn(
                  "border-b transition-colors",
                  interactive && "cursor-pointer hover:bg-accent/40",
                )}
              >
                {columns.map((col, idx) => (
                  <td
                    key={`${String(key)}-c-${idx}`}
                    className={cn("p-3 align-middle", alignClass(col.align), col.className)}
                  >
                    {col.accessor(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
