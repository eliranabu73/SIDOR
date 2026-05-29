import * as React from "react";
import { cn } from "@/lib/utils";

export interface SafeAreaPaddingProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Apply `padding-top: env(safe-area-inset-top)`. */
  top?: boolean;
  /** Apply `padding-bottom: env(safe-area-inset-bottom)`. */
  bottom?: boolean;
  /** Apply `padding-left: env(safe-area-inset-left)`. */
  left?: boolean;
  /** Apply `padding-right: env(safe-area-inset-right)`. */
  right?: boolean;
}

/**
 * Wrapper that adds iOS/Android safe-area insets via inline `env()` padding.
 *
 * Use for **sticky/fixed elements** that need to clear the notch (`top`) or
 * home-indicator (`bottom`) — e.g. a sticky "Save" bar at the bottom of a
 * wizard step, or a fixed top toolbar in a fullscreen sheet.
 *
 * For floating buttons, prefer
 * {@link import("./floating-action-button").FloatingActionButton} which already
 * bakes safe-area in.
 *
 * @example
 * ```tsx
 * <SafeAreaPadding bottom className="sticky bottom-0 bg-background border-t p-4">
 *   <Button className="w-full">המשך</Button>
 * </SafeAreaPadding>
 * ```
 */
export const SafeAreaPadding = React.forwardRef<HTMLDivElement, SafeAreaPaddingProps>(
  function SafeAreaPadding(
    { top, bottom, left, right, style, className, children, ...rest },
    ref,
  ) {
    const safeStyle: React.CSSProperties = { ...style };
    if (top) safeStyle.paddingTop = `max(${style?.paddingTop ?? "0px"}, env(safe-area-inset-top))`;
    if (bottom)
      safeStyle.paddingBottom = `max(${style?.paddingBottom ?? "0px"}, env(safe-area-inset-bottom))`;
    if (left)
      safeStyle.paddingLeft = `max(${style?.paddingLeft ?? "0px"}, env(safe-area-inset-left))`;
    if (right)
      safeStyle.paddingRight = `max(${style?.paddingRight ?? "0px"}, env(safe-area-inset-right))`;

    return (
      <div ref={ref} className={cn(className)} style={safeStyle} {...rest}>
        {children}
      </div>
    );
  },
);
