"use client";

import * as React from "react";
import { Link2, Copy, Check, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRequestLinks } from "@/lib/queries";
import type { RequestLink } from "@/lib/api";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Manager action: hand each employee a personal link to fill availability +
 * time-off BEFORE the schedule is built. One link per worker (copy or send via
 * WhatsApp), plus "copy all". Reuses the existing /e/{token} self-service page.
 */
export function RequestLinksButton() {
  const [open, setOpen] = React.useState(false);
  const links = useRequestLinks(open);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const onCopy = async (l: RequestLink) => {
    const ok = await copy(l.url);
    if (ok) {
      setCopiedId(l.employeeId);
      toast.success(`הקישור של ${l.fullName} הועתק`);
      setTimeout(() => setCopiedId((c) => (c === l.employeeId ? null : c)), 1500);
    } else {
      toast.error("העתקה נכשלה");
    }
  };

  const copyAll = async () => {
    const all = (links.data?.links ?? [])
      .map((l) => `${l.fullName}: ${l.url}`)
      .join("\n");
    if (!all) return;
    const ok = await copy(all);
    toast[ok ? "success" : "error"](ok ? "כל הקישורים הועתקו" : "העתקה נכשלה");
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-11 sm:h-10"
        aria-label="קישורי בקשות לעובדים"
        title="הפק קישור אישי לכל עובד למילוי זמינות ובקשות"
      >
        <Link2 className="h-4 w-4" />
        <span className="hidden sm:inline">קישורי בקשות</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              קישורי בקשות לעובדים
            </DialogTitle>
            <DialogDescription>
              שלחו לכל עובד את הקישור האישי שלו — הוא ימלא זמינות ובקשות חופש, וזה יתעדכן
              אצלכם אוטומטית. הקישור תקף ל-90 יום, אין צורך בהתחברות.
            </DialogDescription>
          </DialogHeader>

          {links.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">טוען קישורים…</p>
          ) : (links.data?.links.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              אין עובדים פעילים. הוסיפו עובדים תחילה.
            </p>
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={copyAll}>
                  <Copy className="h-4 w-4" /> העתק הכול
                </Button>
              </div>
              <div className="space-y-2">
                {links.data!.links.map((l) => (
                  <div
                    key={l.employeeId}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.fullName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onCopy(l)}
                      title="העתק קישור"
                    >
                      {copiedId === l.employeeId ? (
                        <Check className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <a
                      href={l.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1 rounded-md bg-emerald-500 px-2.5 text-xs font-medium text-white hover:bg-emerald-600"
                      title="שלח ב-WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
