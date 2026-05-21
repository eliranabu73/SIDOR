"use client";

import type { AssignmentProposal } from "@/lib/types";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  proposals: AssignmentProposal[] | null;
  onApply: () => void;
  onDismiss: () => void;
  pending?: boolean;
}

export function ProposalOverlay({ proposals, onApply, onDismiss, pending }: Props) {
  if (!proposals || proposals.length === 0) return null;
  return (
    <div className="fixed bottom-4 start-1/2 -translate-x-1/2 z-40 w-[min(640px,90vw)] rounded-lg border bg-card shadow-lg p-3 flex items-center gap-3">
      <Sparkles className="h-5 w-5 text-primary shrink-0" aria-hidden />
      <div className="text-sm flex-1">
        <div className="font-medium">
          {proposals.length} הצעות שיבוץ אוטומטיות זמינות
        </div>
        <div className="text-xs text-muted-foreground">
          סקור ואשר כדי להחיל על הסידור.
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onDismiss} disabled={pending}>
        <X className="h-4 w-4" />
        בטל
      </Button>
      <Button size="sm" onClick={onApply} disabled={pending}>
        {pending ? "מחיל…" : "החל"}
      </Button>
    </div>
  );
}
