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
    <div className="rounded-lg border bg-card overflow-hidden">
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
  );
}
