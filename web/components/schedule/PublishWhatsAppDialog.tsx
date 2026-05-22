"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPublishBundle, type PublishBundle } from "@/lib/api";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string | null;
};

export function PublishWhatsAppDialog({ open, onOpenChange, scheduleId }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [bundle, setBundle] = React.useState<PublishBundle | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !scheduleId) return;
    setLoading(true);
    setBundle(null);
    fetchPublishBundle(scheduleId)
      .then(setBundle)
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "טעינת ההודעה נכשלה");
      })
      .finally(() => setLoading(false));
  }, [open, scheduleId]);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      toast.error("העתקה נכשלה");
    }
  };

  const groupWhatsAppLink = bundle
    ? `https://wa.me/?text=${encodeURIComponent(bundle.groupMessage)}`
    : "#";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-500" />
            פרסום ב-WhatsApp
          </DialogTitle>
          <DialogDescription>
            הודעה לקבוצה + קישור אישי לכל עובד/ת. אין צורך בהתקנת אפליקציה.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-32" />
          </div>
        ) : !bundle ? null : (
          <div className="space-y-5">
            {/* Group message */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">הודעה לקבוצה</h3>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(bundle.groupMessage, "group")}
                  >
                    {copiedKey === "group" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    העתק
                  </Button>
                  <Button size="sm" variant="glow" asChild>
                    <a
                      href={groupWhatsAppLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      פתח ב-WhatsApp
                    </a>
                  </Button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm leading-6">
                {bundle.groupMessage}
              </pre>
            </section>

            {/* Per-employee links */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">
                קישור אישי לכל עובד/ת ({bundle.links.length})
              </h3>
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border p-1.5">
                {bundle.links.map((l) => (
                  <div
                    key={l.employeeId}
                    className="flex items-center gap-2 rounded-md bg-card/60 px-3 py-2 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{l.fullName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {l.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {l.phone}
                          </span>
                        ) : (
                          <span>אין טלפון</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copy(l.url, l.employeeId)}
                      title="העתק קישור אישי"
                    >
                      {copiedKey === l.employeeId ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={l.whatsapp}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="פתח ב-WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
                      </a>
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
