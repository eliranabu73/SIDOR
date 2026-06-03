"use client";

import * as React from "react";
import { DateTime } from "luxon";
import { Inbox } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useRequestsSummary } from "@/lib/queries";

const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function fmt(iso: string): string {
  const d = DateTime.fromISO(iso).setZone("Asia/Jerusalem");
  const day = DAYS[d.weekday % 7] ?? "";
  return `${day} ${d.toFormat("dd/MM")}`;
}

/**
 * Top-bar button that surfaces incoming employee requests (time-off submitted
 * via the share link + recently-updated availability). A badge shows the count
 * so the manager knows constraints arrived before pressing "auto-schedule".
 */
export function RequestsInboxButton() {
  const [open, setOpen] = React.useState(false);
  const summary = useRequestsSummary();
  const count = summary.data?.total ?? 0;
  const items = summary.data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-11 sm:h-10"
          aria-label="בקשות עובדים"
          title="בקשות ואילוצים שהעובדים הגישו"
        >
          <Inbox className="h-4 w-4" />
          <span className="hidden sm:inline">בקשות</span>
          {count > 0 && (
            <span className="absolute -top-1.5 -end-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>בקשות עובדים</SheetTitle>
          <SheetDescription>
            {summary.isLoading
              ? "טוען…"
              : count === 0
                ? "אין בקשות חדשות"
                : `${summary.data?.pendingTimeOff ?? 0} בקשות היעדרות · ${
                    summary.data?.recentAvailabilityUpdates ?? 0
                  } עדכוני זמינות`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 overflow-y-auto">
          {items.length === 0 && !summary.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              כשעובדים יגישו אילוצים בקישור האישי הם יופיעו כאן.
            </p>
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                className="rounded-lg border bg-card p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{it.employeeName}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                    היעדרות
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground" dir="ltr">
                  {fmt(it.startAtUtc)} – {fmt(it.endAtUtc)}
                </div>
                {it.reason ? (
                  <div className="mt-1 text-xs text-foreground/80">{it.reason}</div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          הבקשות נלקחות בחשבון אוטומטית ב"שיבוץ אוטומטי" — עובד שביקש היעדרות לא ישובץ באותו זמן.
        </p>
      </SheetContent>
    </Sheet>
  );
}
