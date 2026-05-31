"use client";

import { AlertTriangle, Ban, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { RuleResult } from "@/lib/types";
import { explainRule } from "@/lib/lawCatalog";

interface Props {
  open: boolean;
  warnings: RuleResult[];
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  /** "warning" → user may proceed; "blocking" → hard violation, no override. */
  variant?: "warning" | "blocking";
}

export function ConfirmWarningsDialog({
  open,
  warnings,
  onConfirm,
  onCancel,
  pending,
  variant = "warning",
}: Props) {
  const blocking = variant === "blocking";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            {blocking ? (
              <Ban className="h-5 w-5 text-destructive" aria-hidden />
            ) : (
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
            )}
            {blocking ? "השיבוץ חורג מהחוק" : "יש אזהרות לשיבוץ"}
          </DialogTitle>
          <DialogDescription>
            {blocking
              ? "לא ניתן לשבץ עד שהבעיות הבאות ייפתרו:"
              : "בדקו את האזהרות הבאות לפני אישור השיבוץ:"}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 max-h-72 overflow-y-auto">
          {warnings.map((w, i) => {
            const info = explainRule(w.code);
            return (
              <li
                key={`${w.code}-${i}`}
                role="group"
                aria-label={info.title}
                className={`rounded-md border p-3 text-sm ${
                  blocking ? "bg-destructive/5 border-destructive/30" : "bg-warning/5"
                }`}
              >
                <div className="font-semibold text-foreground">{info.title}</div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {info.law}
                </p>
                {info.fix ? (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-foreground">
                    <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span>
                      <span className="font-medium">איך לתקן: </span>
                      {info.fix}
                    </span>
                  </p>
                ) : null}
                {/* Original message kept as a subtle detail for context. */}
                {w.message ? (
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{w.message}</p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {blocking ? "סגור" : "ביטול"}
          </Button>
          {!blocking && (
            <Button onClick={onConfirm} disabled={pending}>
              {pending ? "משבץ…" : "שבץ בכל זאת"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
