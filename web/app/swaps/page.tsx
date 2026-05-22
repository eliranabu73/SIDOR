"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  XCircle,
} from "lucide-react";
import { DateTime } from "luxon";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveSwap,
  fetchPendingSwaps,
  fetchSwapCandidates,
  rejectSwap,
  type PendingSwap,
  type SwapCandidate,
} from "@/lib/api";
import { toast } from "sonner";

export default function SwapsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <SwapsInner />
      </AppShell>
    </AuthGuard>
  );
}

function SwapsInner() {
  const swapsQ = useQuery({
    queryKey: ["swap-requests"],
    queryFn: fetchPendingSwaps,
    staleTime: 15_000,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ArrowLeftRight className="h-6 w-6 text-indigo-500" />
          בקשות החלפת משמרת
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          עובדים שביקשו שתמצא להם מחליף. אישור פה מעדכן את הסידור באופן אוטומטי.
        </p>
      </header>

      {swapsQ.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : swapsQ.isError ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            שגיאה בטעינת הבקשות
          </CardContent>
        </Card>
      ) : (swapsQ.data?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <span>אין בקשות החלפה ממתינות. הכל סגור.</span>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {swapsQ.data!.map((s) => (
            <SwapRow key={s.id} swap={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function SwapRow({ swap }: { swap: PendingSwap }) {
  const qc = useQueryClient();
  const candidatesQ = useQuery({
    queryKey: ["swap-candidates", swap.id],
    queryFn: () => fetchSwapCandidates(swap.id),
    staleTime: 30_000,
  });
  const approve = useMutation({
    mutationFn: (targetEmployeeId: string) => approveSwap(swap.id, targetEmployeeId),
    onSuccess: async () => {
      toast.success("ההחלפה אושרה");
      await qc.invalidateQueries({ queryKey: ["swap-requests"] });
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "אישור נכשל"),
  });
  const reject = useMutation({
    mutationFn: () => rejectSwap(swap.id),
    onSuccess: async () => {
      toast.success("הבקשה נדחתה");
      await qc.invalidateQueries({ queryKey: ["swap-requests"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "דחייה נכשלה"),
  });

  const tz = "Asia/Jerusalem";
  const start = DateTime.fromISO(swap.shift.startsAt, { zone: tz });
  const end = DateTime.fromISO(swap.shift.endsAt, { zone: tz });

  return (
    <Card className="bento-corner-glow">
      <CardContent className="space-y-4 p-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">בקשה מ-</div>
            <div className="text-lg font-semibold">
              {swap.requester.fullName}
            </div>
            {swap.requester.phone ? (
              <a
                href={`tel:${swap.requester.phone}`}
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Phone className="h-3 w-3" />
                {swap.requester.phone}
              </a>
            ) : null}
          </div>
          <div className="text-end text-xs text-muted-foreground">
            {DateTime.fromISO(swap.createdAt).setLocale("he").toRelative()}
          </div>
        </header>

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <Clock className="h-4 w-4 text-indigo-500" />
            {start.setLocale("he").toFormat("EEEE · d בMMMM")} ·{" "}
            {start.toFormat("HH:mm")} – {end.toFormat("HH:mm")}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {swap.shift.role ? <span>תפקיד: {swap.shift.role}</span> : null}
            {swap.shift.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {swap.shift.location}
              </span>
            ) : null}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">מועמדים אפשריים</h3>
          {candidatesQ.isLoading ? (
            <Skeleton className="h-20" />
          ) : (candidatesQ.data?.length ?? 0) === 0 ? (
            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              לא נמצאו עובדים מתאימים. נסה לבטל את המשמרת או לשבץ ידנית.
            </div>
          ) : (
            <div className="space-y-1.5">
              {candidatesQ.data!.map((c) => (
                <CandidateRow
                  key={c.employeeId}
                  candidate={c}
                  pending={approve.isPending && approve.variables === c.employeeId}
                  onApprove={() => approve.mutate(c.employeeId)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={reject.isPending}
            onClick={() => reject.mutate()}
          >
            <XCircle className="h-4 w-4" />
            דחה בקשה
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CandidateRow({
  candidate,
  pending,
  onApprove,
}: {
  candidate: SwapCandidate;
  pending: boolean;
  onApprove: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
        candidate.conflicting
          ? "bg-amber-500/5 border border-amber-500/30"
          : "bg-card/60 border border-border"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium">{candidate.fullName}</div>
        <div className="text-xs text-muted-foreground">
          {candidate.conflicting ? "⚠️ קונפליקט שיבוצים — בדוק לפני אישור" : "✓ פנוי לתפקיד"}
        </div>
      </div>
      {candidate.phone ? (
        <a
          href={`https://wa.me/${(candidate.phone || "").replace(/[^\d]/g, "").replace(/^0/, "972")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-500 hover:text-emerald-400"
          title="פתח שיחה ב-WhatsApp"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : null}
      <Button
        size="sm"
        variant={candidate.conflicting ? "outline" : "glow"}
        onClick={onApprove}
        disabled={pending}
      >
        {pending ? "מאשר…" : "אשר החלפה"}
      </Button>
    </div>
  );
}
