"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { Plane, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTimeOff } from "@/lib/api";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  onSubmitted?: () => void;
};

export function TimeOffDialog({ open, onOpenChange, token, onSubmitted }: Props) {
  const today = DateTime.now().setZone("Asia/Jerusalem").toFormat("yyyy-MM-dd");
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(today);
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const startAt = DateTime.fromISO(`${startDate}T00:00`, {
        zone: "Asia/Jerusalem",
      });
      const endAt = DateTime.fromISO(`${endDate}T23:59`, {
        zone: "Asia/Jerusalem",
      });
      await createTimeOff(token, {
        startsAt: startAt.toUTC().toISO() ?? "",
        endsAt: endAt.toUTC().toISO() ?? "",
        reason: reason.trim() || undefined,
      });
      toast.success("הבקשה נשלחה למנהל");
      setReason("");
      onSubmitted?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שליחת הבקשה נכשלה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-indigo-500" />
            בקשת חופש
          </DialogTitle>
          <DialogDescription>
            המנהל יקבל התראה, יאשר או ידחה — תקבל/י עדכון בקישור שלך.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="from">מתאריך</Label>
              <Input
                id="from"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">עד תאריך</Label>
              <Input
                id="to"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="reason">סיבה (אופציונלי)</Label>
            <Input
              id="reason"
              placeholder="חופש משפחתי, מילואים, רפואי…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={280}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button variant="glow" onClick={submit} disabled={submitting}>
            <Send className="h-4 w-4" />
            {submitting ? "שולח…" : "שלח בקשה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
