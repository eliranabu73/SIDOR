"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveTimeOff,
  fetchTimeOffForEmployee,
  rejectTimeOff,
  type TimeOffRequestItem,
  type TimeOffStatus,
} from "@/lib/api";

interface Props {
  employeeId: string;
}

const STATUS_LABEL: Record<TimeOffStatus, string> = {
  PENDING: "ממתין",
  APPROVED: "אושר",
  REJECTED: "נדחה",
  CANCELLED: "בוטל",
};

const STATUS_VARIANT: Record<TimeOffStatus, "default" | "outline" | "success" | "destructive" | "secondary"> = {
  PENDING: "secondary",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

function formatRange(item: TimeOffRequestItem): string {
  const fmt = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleString("he-IL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
  return `${fmt(item.startsAt)} → ${fmt(item.endsAt)}`;
}

export function TimeOffList({ employeeId }: Props): React.JSX.Element {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["employee-timeoff", employeeId],
    queryFn: () => fetchTimeOffForEmployee(employeeId),
  });

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ["employee-timeoff", employeeId] });
  };

  const approveMut = useMutation({
    mutationFn: (id: string) => approveTimeOff(id),
    onSuccess: () => {
      toast.success("הבקשה אושרה");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "אישור הבקשה נכשל"),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectTimeOff(id),
    onSuccess: () => {
      toast.success("הבקשה נדחתה");
      invalidate();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "דחיית הבקשה נכשלה"),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        טעינת בקשות חופשה נכשלה.
      </div>
    );
  }

  const items = query.data ?? [];
  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        אין בקשות חופשה לעובד/ת זה.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-lg border bg-card p-3 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[item.status]}>
                {STATUS_LABEL[item.status]}
              </Badge>
              <span className="text-sm font-medium">{formatRange(item)}</span>
            </div>
            {item.reason ? (
              <p className="mt-1 text-xs text-muted-foreground">
                סיבה: {item.reason}
              </p>
            ) : null}
          </div>
          {item.status === "PENDING" ? (
            <div className="mt-2 flex gap-2 sm:mt-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => approveMut.mutate(item.id)}
                disabled={approveMut.isPending}
              >
                <Check className="h-4 w-4" />
                אישור
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => rejectMut.mutate(item.id)}
                disabled={rejectMut.isPending}
              >
                <X className="h-4 w-4" />
                דחייה
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
