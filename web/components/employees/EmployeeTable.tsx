"use client";

import { Pencil, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocations } from "@/lib/queries";
import type { Employee } from "@/lib/types";

interface Props {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onToggleActive: (employee: Employee) => void;
}

export function EmployeeTable({ employees, onEdit, onToggleActive }: Props) {
  const locationsQuery = useLocations();
  const locations = Object.fromEntries(
    (locationsQuery.data ?? []).map((l) => [l.id, l.name]),
  );
  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="sm:hidden space-y-2">
        {employees.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            אין עובדים להצגה
          </div>
        ) : (
          employees.map((e) => (
            <div
              key={e.id}
              className="rounded-lg border bg-card p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold truncate">{e.fullName}</div>
                  {e.email ? (
                    <div className="text-xs text-muted-foreground truncate">{e.email}</div>
                  ) : null}
                </div>
                <div className="shrink-0">
                  {e.active ? (
                    <Badge variant="success">פעיל/ה</Badge>
                  ) : (
                    <Badge variant="outline">לא פעיל/ה</Badge>
                  )}
                </div>
              </div>
              {e.roles.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {e.roles.map((r) => (
                    <Badge key={r} variant="secondary">{r}</Badge>
                  ))}
                </div>
              ) : null}
              {e.primaryLocationId ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  סניף: {locations[e.primaryLocationId] ?? "—"}
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-11"
                  onClick={() => onEdit(e)}
                  aria-label={`ערוך את ${e.fullName}`}
                >
                  <Pencil className="h-4 w-4" />
                  ערוך
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onToggleActive(e)}
                  aria-label={e.active ? `השבת את ${e.fullName}` : `הפעל את ${e.fullName}`}
                >
                  <Power className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden sm:block rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground text-xs">
          <tr>
            <th className="text-start p-3 font-medium">שם</th>
            <th className="text-start p-3 font-medium">דוא״ל</th>
            <th className="text-start p-3 font-medium">תפקידים</th>
            <th className="text-start p-3 font-medium">סניף</th>
            <th className="text-start p-3 font-medium">סטטוס</th>
            <th className="text-start p-3 font-medium" aria-label="פעולות" />
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.id} className="border-t hover:bg-muted/30">
              <td className="p-3 font-medium">{e.fullName}</td>
              <td className="p-3 text-muted-foreground">{e.email ?? "—"}</td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1">
                  {e.roles.map((r) => (
                    <Badge key={r} variant="secondary">
                      {r}
                    </Badge>
                  ))}
                </div>
              </td>
              <td className="p-3 text-muted-foreground">
                {e.primaryLocationId ? locations[e.primaryLocationId] ?? "—" : "—"}
              </td>
              <td className="p-3">
                {e.active ? (
                  <Badge variant="success">פעיל/ה</Badge>
                ) : (
                  <Badge variant="outline">לא פעיל/ה</Badge>
                )}
              </td>
              <td className="p-3 text-end">
                <div className="inline-flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(e)}
                    aria-label={`ערוך את ${e.fullName}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onToggleActive(e)}
                    aria-label={e.active ? `השבת את ${e.fullName}` : `הפעל את ${e.fullName}`}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {employees.length === 0 ? (
            <tr>
              <td colSpan={6} className="p-8 text-center text-muted-foreground">
                אין עובדים להצגה
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>
    </>
  );
}
