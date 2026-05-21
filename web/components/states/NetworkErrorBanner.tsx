"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Sticky-top error banner — NOT a toast.
 *
 * Co-designed with ChatGPT (Q4, 2026-05-21):
 *   - Toasts disappear; persistent banner keeps the user aware.
 *   - Copy is honest about the state and what's being attempted.
 *   - Never expose raw "Network Error / 500 / Fetch failed" to the user.
 *
 * Variants:
 *   - 'reconnecting' (default): auto-retry happening in background
 *   - 'action-failed': last user action did not persist
 */
interface Props {
  variant?: "reconnecting" | "action-failed";
  onRetry?: () => void;
  onCheckConnection?: () => void;
}

export function NetworkErrorBanner({
  variant = "reconnecting",
  onRetry,
  onCheckConnection,
}: Props) {
  const title =
    variant === "action-failed"
      ? "השינוי לא נשמר."
      : "לא הצלחנו לעדכן את הנתונים.";
  const subtitle =
    variant === "action-failed"
      ? "נסה שוב כדי לשמור את השינוי."
      : "המערכת תנסה להתחבר מחדש באופן אוטומטי.";

  return (
    <div
      role="alert"
      aria-live="polite"
      className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b px-4 py-2.5 backdrop-blur"
      style={{
        backgroundColor: "var(--banner-error-bg)",
        borderColor: "var(--banner-error-border)",
        color: "var(--banner-error-fg)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
        <div className="text-sm">
          <span className="font-medium">{title}</span>
          <span className="opacity-80 mx-2">·</span>
          <span className="opacity-90">{subtitle}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" />
            נסה עכשיו
          </Button>
        )}
        {onCheckConnection && (
          <button
            type="button"
            onClick={onCheckConnection}
            className="text-xs underline-offset-4 hover:underline opacity-80"
          >
            בדוק חיבור
          </button>
        )}
      </div>
    </div>
  );
}
