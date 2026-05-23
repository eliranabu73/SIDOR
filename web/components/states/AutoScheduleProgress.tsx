"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

/**
 * Top progress bar shown while the Auto-Scheduler is computing proposals.
 *
 * Co-designed with ChatGPT (Q4, 2026-05-21):
 *   - Partial overlay only — NEVER replace the whole board with a skeleton.
 *     The manager wants to see what already exists while the system thinks.
 *   - Linear-style indeterminate top bar.
 *   - Staged copy:
 *       0s    → "יוצר הצעת שיבוץ..."  / "בודק זמינות, העדפות וחוקי עבודה"
 *       >2s   → "נמצאו N אפשרויות שיבוץ. מחשב את ההצעה הטובה ביותר..."
 *       >5s   → "עדיין עובד... אפשר להמשיך לצפות בסידור."
 */
interface Props {
  /** Optional candidate count to surface in the >2s copy. */
  candidatesCount?: number;
  /** When true, the progress is mounted (parent controls). */
  active: boolean;
}

export function AutoScheduleProgress({ candidatesCount, active }: Props) {
  const [elapsedMs, setElapsedMs] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 500);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const stage = elapsedMs > 5000 ? 3 : elapsedMs > 2000 ? 2 : 1;
  const title =
    stage === 1
      ? "יוצר הצעת שיבוץ..."
      : stage === 2
        ? candidatesCount
          ? `נמצאו ${candidatesCount} אפשרויות שיבוץ`
          : "מנתח אפשרויות שיבוץ"
        : "עדיין עובד...";
  const subtitle =
    stage === 1
      ? "בודק זמינות, העדפות וחוקי עבודה"
      : stage === 2
        ? "מחשב את ההצעה הטובה ביותר..."
        : "אפשר להמשיך לצפות בסידור.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 border-b backdrop-blur"
      style={{
        backgroundColor: "var(--color-processing-bg)",
        borderColor: "var(--color-processing-border)",
        color: "var(--color-processing-fg)",
      }}
    >
      <div className="indeterminate-bar" aria-hidden />
      <div className="flex items-center gap-2 px-4 py-2">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <div className="text-sm">
          <span className="font-medium">{title}</span>
          <span className="opacity-80 mx-2">·</span>
          <span className="opacity-90">{subtitle}</span>
        </div>
      </div>
    </div>
  );
}
