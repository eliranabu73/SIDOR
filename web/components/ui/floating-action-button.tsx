"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type FabPosition = "bottom-end" | "bottom-start" | "bottom-center";
export type FabDesktopVariant = "hidden" | "compact";

export interface FloatingActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Icon element rendered inside the round button (e.g. `<Plus />`). */
  icon: React.ReactNode;
  /** Accessible label — used for `aria-label` and as visible text in `compact` desktop variant. */
  label: string;
  /**
   * Fixed position. `bottom-end` (default) sits on the right in LTR / left in RTL,
   * clearing the AppShell mobile bottom-nav.
   */
  position?: FabPosition;
  /**
   * What to do on `sm:` and above.
   * - `"hidden"` (default): FAB is mobile-only.
   * - `"compact"`: stays visible, expands to a pill with icon + label.
   */
  desktopVariant?: FabDesktopVariant;
}

const positionClasses: Record<FabPosition, string> = {
  "bottom-end": "end-4",
  "bottom-start": "start-4",
  "bottom-center": "start-1/2 -translate-x-1/2 rtl:translate-x-1/2",
};

/**
 * Floating Action Button — a thumb-reachable primary action anchored to the
 * bottom of the viewport. Designed to clear the AppShell mobile bottom-nav
 * (`bottom-20`) and the iOS home-indicator safe area.
 *
 * Use {@link FloatingActionButton} for the **single primary "create" action**
 * on a list screen (add employee, request time-off, create swap). For multi-
 * action toolbars, use a sticky toolbar instead.
 *
 * @example
 * ```tsx
 * <FloatingActionButton
 *   icon={<Plus className="h-6 w-6" />}
 *   label="הוסף עובד"
 *   onClick={() => setOpen(true)}
 * />
 * ```
 */
export const FloatingActionButton = React.forwardRef<
  HTMLButtonElement,
  FloatingActionButtonProps
>(function FloatingActionButton(
  {
    icon,
    label,
    position = "bottom-end",
    desktopVariant = "hidden",
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const desktopClass =
    desktopVariant === "hidden"
      ? "sm:hidden"
      : "sm:w-auto sm:rounded-full sm:px-5 sm:gap-2";

  return (
    <div
      className={cn(
        "fixed bottom-20 z-40 pb-[env(safe-area-inset-bottom)]",
        positionClasses[position],
        desktopVariant === "hidden" && "sm:hidden",
      )}
    >
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cn(
          "inline-flex items-center justify-center h-14 w-14 rounded-full",
          "bg-primary text-primary-foreground shadow-lg",
          "transition-transform active:scale-95",
          "hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          desktopClass,
          className,
        )}
        {...rest}
      >
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
        {desktopVariant === "compact" && (
          <span className="hidden sm:inline text-sm font-medium">{label}</span>
        )}
      </button>
    </div>
  );
});
