"use client";

import { AlertTriangle } from "lucide-react";
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

interface Props {
  open: boolean;
  warnings: RuleResult[];
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
}

export function ConfirmWarningsDialog({
  open,
  warnings,
  onConfirm,
  onCancel,
  pending,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            יש אזהרות לשיבוץ
          </DialogTitle>
          <DialogDescription>
            בדוק את האזהרות הבאות לפני אישור השיבוץ.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 max-h-60 overflow-y-auto">
          {warnings.map((w, i) => (
            <li
              key={`${w.code}-${i}`}
              className="rounded-md border bg-warning/5 p-3 text-sm"
            >
              <div className="font-medium">{w.message}</div>
              <div className="text-xs text-muted-foreground">{w.code}</div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            ביטול
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "משבץ…" : "שבץ בכל זאת"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
