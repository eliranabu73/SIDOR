"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminApi } from "@/lib/api";
import { ExportCsvButton } from "@/components/admin/ExportCsvButton";

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const actionColors: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  UPDATE: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  DELETE: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  ASSIGN: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  UNASSIGN: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  PUBLISH: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  LOCK: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
};

const ACTION_OPTIONS = [
  "ALL",
  "CREATE",
  "UPDATE",
  "DELETE",
  "ASSIGN",
  "UNASSIGN",
  "PUBLISH",
  "LOCK",
];

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default function AdminAuditPage() {
  const [orgId, setOrgId] = React.useState("");
  const [orgIdDebounced, setOrgIdDebounced] = React.useState("");
  const [action, setAction] = React.useState<string>("ALL");
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");

  // Load org list for the picker (small list, just for convenience)
  const orgs = useQuery({
    queryKey: ["admin", "orgs", "audit-picker"],
    queryFn: () => adminApi.orgs({ limit: 100, offset: 0 }),
    staleTime: 60_000,
  });

  React.useEffect(() => {
    const t = setTimeout(() => setOrgIdDebounced(orgId.trim()), 300);
    return () => clearTimeout(t);
  }, [orgId]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit", orgIdDebounced, action, from, to],
    queryFn: () =>
      adminApi.audit({
        orgId: UUID_RE.test(orgIdDebounced) ? orgIdDebounced : undefined,
        action: action !== "ALL" ? action : undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 200,
      }),
    staleTime: 10_000,
  });

  const items = data?.items ?? [];

  const resetFilters = () => {
    setOrgId("");
    setAction("ALL");
    setFrom("");
    setTo("");
  };

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">יומן ביקורת</h1>
          <p className="text-sm text-muted-foreground">
            לוג פעולות אחרון על פני כל הארגונים — עד 200 רשומות אחרונות.
          </p>
        </div>
        <ExportCsvButton type="audit" />
      </header>

      <Card>
        <CardContent className="p-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">ארגון</label>
            <Select
              value={UUID_RE.test(orgId) ? orgId : "ALL"}
              onValueChange={(v) => setOrgId(v === "ALL" ? "" : v)}
              dir="rtl"
            >
              <SelectTrigger>
                <SelectValue placeholder="כל הארגונים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">כל הארגונים</SelectItem>
                {(orgs.data?.items ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">סוג פעולה</label>
            <Select value={action} onValueChange={setAction} dir="rtl">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a === "ALL" ? "הכל" : a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">מתאריך</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">עד תאריך</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="w-full"
            >
              נקה
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr className="text-right">
                  <th className="px-4 py-3 font-medium">זמן</th>
                  <th className="px-4 py-3 font-medium">ארגון</th>
                  <th className="px-4 py-3 font-medium">פעולה</th>
                  <th className="px-4 py-3 font-medium">סוג ישות</th>
                  <th className="px-4 py-3 font-medium">מזהה ישות</th>
                  <th className="px-4 py-3 font-medium">משתמש</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-t border-border">
                      <td colSpan={6} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      אין רשומות
                    </td>
                  </tr>
                ) : (
                  items.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(a.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {a.organization?.name ?? "—"}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {a.organizationId.slice(0, 8)}…
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={actionColors[a.actionType] ?? ""}
                        >
                          {a.actionType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.entityType}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {a.entityId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {a.userId ? `${a.userId.slice(0, 8)}…` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
