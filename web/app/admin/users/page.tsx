"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";

const PAGE_SIZE = 25;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function AdminUsersPage() {
  const [offset, setOffset] = React.useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "users", offset],
    queryFn: () => adminApi.users({ limit: PAGE_SIZE, offset }),
    staleTime: 15_000,
  });

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="container max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">משתמשים</h1>
        <p className="text-sm text-muted-foreground">
          {total > 0
            ? `${total.toLocaleString("he-IL")} משתמשים שונים עם חברות בארגון`
            : "טוען..."}
        </p>
      </header>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr className="text-right">
                  <th className="px-4 py-3 font-medium">מזהה משתמש</th>
                  <th className="px-4 py-3 font-medium">ארגונים</th>
                  <th className="px-4 py-3 font-medium tabular-nums">סך</th>
                  <th className="px-4 py-3 font-medium">הצטרף לראשונה</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-t border-border">
                      <td colSpan={4} className="px-4 py-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      אין משתמשים
                    </td>
                  </tr>
                ) : (
                  items.map((u) => (
                    <tr key={u.userId} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">
                        {u.userId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {u.memberships.map((m, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[11px]"
                            >
                              <span className="font-medium">{m.org.name}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {m.role}
                              </Badge>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{u.orgCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(u.firstJoined)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          מציג {items.length === 0 ? 0 : offset + 1}–{offset + items.length} מתוך {total}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            הקודם
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            הבא
          </Button>
        </div>
      </div>
    </div>
  );
}
