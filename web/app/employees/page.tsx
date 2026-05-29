"use client";

import * as React from "react";
import Link from "next/link";
import { Lock, Pencil, Plus, Power, Sliders, Upload } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { EmployeeForm, type EmployeeFormData } from "@/components/employees/EmployeeForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FloatingActionButton } from "@/components/ui/floating-action-button";
import { Input } from "@/components/ui/input";
import { MobileTable, type MobileTableColumn } from "@/components/ui/mobile-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  useCreateEmployee,
  useDeleteEmployee,
  useEmployeesSummary,
  useLocations,
  useRoles,
  useUpdateEmployee,
} from "@/lib/queries";
import { createEmployee as apiCreateEmployee, createRole as apiCreateRole } from "@/lib/api";
import type { CreateEmployeeBody, UpdateEmployeeBody, RoleItem } from "@/lib/api";
import type { Employee } from "@/lib/types";

interface BulkRow {
  fullName: string;
  phone?: string;
  role?: string;
}

/**
 * Parse a free-form bulk-import textarea where each line is one employee.
 * Splits on comma, tab, or dash; the first non-empty cell is the name, the
 * second is treated as a phone, the third as a role. Skips blank lines.
 */
function parseBulkRows(raw: string): BulkRow[] {
  const out: BulkRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cells = line
      .split(/[,\t\-–]/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length === 0) continue;
    const [name, phone, role] = cells;
    if (!name) continue;
    const row: BulkRow = { fullName: name };
    if (phone) row.phone = phone;
    if (role) row.role = role;
    out.push(row);
  }
  return out;
}

export default function EmployeesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <EmployeesInner />
      </AppShell>
    </AuthGuard>
  );
}

function parseRoleNames(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  );
}

async function resolveRoleIds(
  names: string[],
  existing: RoleItem[],
): Promise<string[]> {
  const byName = new Map(existing.map((r) => [r.name.toLowerCase(), r]));
  const ids: string[] = [];
  for (const name of names) {
    const hit = byName.get(name.toLowerCase());
    if (hit) {
      ids.push(hit.id);
    } else {
      const created = await apiCreateRole({ name });
      byName.set(created.name.toLowerCase(), created);
      ids.push(created.id);
    }
  }
  return ids;
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "אירעה שגיאה";
}

function ConstraintChip({ count }: { count: number }) {
  if (count > 0) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="h-3 w-3" />
        {count} אילוצים
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-emerald-600">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      גמיש
    </Badge>
  );
}

function EmployeesInner() {
  const employeesQuery = useEmployeesSummary();
  const rolesQuery = useRoles();
  const locationsQuery = useLocations();
  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee();
  const deleteMut = useDeleteEmployee();
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");
  const [bulkSubmitting, setBulkSubmitting] = React.useState(false);
  const bulkPreview = React.useMemo(() => parseBulkRows(bulkText), [bulkText]);

  const runBulkImport = async () => {
    if (bulkPreview.length === 0) return;
    setBulkSubmitting(true);
    let ok = 0;
    let failed = 0;
    try {
      const existingRoles = rolesQuery.data ?? [];
      const roleCache = new Map<string, string>(
        existingRoles.map((r) => [r.name.toLowerCase(), r.id]),
      );
      for (const row of bulkPreview) {
        try {
          let roleIds: string[] | undefined;
          if (row.role) {
            const key = row.role.toLowerCase();
            let id = roleCache.get(key);
            if (!id) {
              const created = await apiCreateRole({ name: row.role });
              id = created.id;
              roleCache.set(key, id);
            }
            roleIds = [id];
          }
          const body: CreateEmployeeBody = {
            fullName: row.fullName,
            ...(row.phone ? { phone: row.phone } : {}),
            ...(roleIds ? { roleIds } : {}),
          };
          await apiCreateEmployee(body);
          ok += 1;
        } catch (err) {
          console.error("Bulk import row failed", row, err);
          failed += 1;
        }
      }
      await qc.invalidateQueries({ queryKey: queryKeys.employees() });
      await qc.invalidateQueries({ queryKey: queryKeys.roles() });
      if (failed === 0) toast.success(`נוספו ${ok} עובדים`);
      else toast.error(`נוספו ${ok}, נכשלו ${failed}`);
      if (failed === 0) {
        setBulkOpen(false);
        setBulkText("");
      }
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Constraint counts are now pre-aggregated server-side in the summary endpoint
  // (replaces the 201-request N+1 pattern: 1 list + 100 availability + 100 preferences).
  const constraintCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of employeesQuery.data ?? []) {
      map[e.id] = e.constraintCount ?? 0;
    }
    return map;
  }, [employeesQuery.data]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employeesQuery.data ?? []).filter((e) =>
      q ? e.fullName.toLowerCase().includes(q) : true,
    );
  }, [employeesQuery.data, search]);

  const startCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const startEdit = (employee: Employee) => {
    setEditing(employee);
    setSheetOpen(true);
  };

  const onSubmit = async (data: EmployeeFormData) => {
    try {
      const names = parseRoleNames(data.roles);
      const existing = rolesQuery.data ?? [];
      const roleIds = await resolveRoleIds(names, existing);
      // If we auto-created any new roles, refresh the roles cache.
      const createdAny = names.some(
        (n) => !existing.find((r) => r.name.toLowerCase() === n.toLowerCase()),
      );
      if (createdAny) {
        await qc.invalidateQueries({ queryKey: queryKeys.roles() });
      }

      if (editing) {
        const body: UpdateEmployeeBody = {
          fullName: data.fullName,
          email: data.email ? data.email : null,
          phone: data.phone ? data.phone : null,
          roleIds,
          defaultLocationId: data.primaryLocationId
            ? data.primaryLocationId
            : null,
          hourlyRate: data.hourlyRate,
          hireDate: data.hireDate ? data.hireDate : null,
          weeklyBudgetHours:
            data.weeklyBudgetHours != null ? data.weeklyBudgetHours : null,
        };
        await updateMut.mutateAsync({ id: editing.id, body });
        toast.success("העובד/ת עודכן/ה");
      } else {
        const body: CreateEmployeeBody = {
          fullName: data.fullName,
          ...(data.email ? { email: data.email } : {}),
          ...(data.phone ? { phone: data.phone } : {}),
          ...(roleIds.length ? { roleIds } : {}),
          ...(data.primaryLocationId
            ? { defaultLocationId: data.primaryLocationId }
            : {}),
          hourlyRate: data.hourlyRate,
          ...(data.hireDate ? { hireDate: data.hireDate } : {}),
          ...(data.weeklyBudgetHours != null
            ? { weeklyBudgetHours: data.weeklyBudgetHours }
            : {}),
        };
        await createMut.mutateAsync(body);
        toast.success("העובד/ת נוסף/ה");
      }
      setSheetOpen(false);
    } catch (err) {
      console.error("Employee submit failed", err);
      toast.error(errorMessage(err));
    }
  };

  const toggleActive = async (employee: Employee) => {
    if (!employee.active) {
      toast.error("הפעלה מחדש של עובד/ת לא נתמכת כרגע");
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm(`להשבית את ${employee.fullName}?`);
      if (!ok) return;
    }
    try {
      await deleteMut.mutateAsync(employee.id);
      toast.success(`${employee.fullName} הושבת/ה`);
    } catch (err) {
      console.error("Employee deactivate failed", err);
      toast.error(errorMessage(err));
    }
  };

  const locationsMap = React.useMemo(
    () => Object.fromEntries((locationsQuery.data ?? []).map((l) => [l.id, l.name])),
    [locationsQuery.data],
  );

  const columns = React.useMemo<ReadonlyArray<MobileTableColumn<Employee>>>(
    () => [
      {
        header: "שם",
        accessor: (e) => (
          <div className="min-w-0">
            <div className="font-semibold truncate">{e.fullName}</div>
            {e.email ? (
              <div className="text-xs text-muted-foreground truncate sm:hidden">
                {e.email}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        header: "דוא״ל",
        accessor: (e) => (
          <span className="text-muted-foreground">{e.email ?? "—"}</span>
        ),
        mobileHidden: true,
      },
      {
        header: "תפקידים",
        accessor: (e) =>
          e.roles.length ? (
            <div className="flex flex-wrap gap-1 justify-end">
              {e.roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {r}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        header: "סניף",
        accessor: (e) => (
          <span className="text-muted-foreground">
            {e.primaryLocationId ? locationsMap[e.primaryLocationId] ?? "—" : "—"}
          </span>
        ),
      },
      {
        header: "סטטוס",
        accessor: (e) =>
          e.active ? (
            <Badge variant="success">פעיל/ה</Badge>
          ) : (
            <Badge variant="outline">לא פעיל/ה</Badge>
          ),
      },
      {
        header: "אילוצים",
        accessor: (e) => <ConstraintChip count={constraintCounts[e.id] ?? 0} />,
      },
      {
        header: "פעולות",
        mobileLabel: false,
        accessor: (e) => (
          <div className="inline-flex gap-1 sm:gap-1 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none h-11 sm:h-9"
              onClick={(ev) => {
                ev.stopPropagation();
                startEdit(e);
              }}
              aria-label={`ערוך את ${e.fullName}`}
            >
              <Pencil className="h-4 w-4" />
              <span className="sm:hidden">ערוך</span>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-11 sm:h-9"
              aria-label={`ערוך אילוצים — ${e.fullName}`}
              onClick={(ev) => ev.stopPropagation()}
            >
              <Link href={`/employees/${e.id}?tab=constraints`}>
                <Sliders className="h-4 w-4" />
                <span className="sm:hidden">אילוצים</span>
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:h-9 sm:w-9"
              onClick={(ev) => {
                ev.stopPropagation();
                toggleActive(e);
              }}
              aria-label={
                e.active ? `השבת את ${e.fullName}` : `הפעל את ${e.fullName}`
              }
            >
              <Power className="h-4 w-4" />
            </Button>
          </div>
        ),
        align: "end",
      },
    ],
    [constraintCounts, locationsMap],
  );

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <h1 className="text-xl font-semibold">עובדים</h1>
        <div className="hidden sm:flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setBulkOpen(true)}
            className="h-10 shrink-0"
          >
            <Upload className="h-4 w-4" />
            <span>ייבוא מרובה</span>
          </Button>
          <Button onClick={startCreate} className="h-10 shrink-0">
            <Plus className="h-4 w-4" />
            <span>הוסף עובד/ת</span>
          </Button>
        </div>
      </div>

      {/* Sticky search row on mobile; inline on desktop */}
      <div className="sticky top-14 z-10 -mx-4 mb-3 bg-background px-4 py-2 sm:static sm:m-0 sm:p-0 sm:mb-4">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם…"
            className="flex-1 sm:w-56 sm:flex-none h-11 sm:h-9"
            aria-label="חיפוש עובד/ת"
          />
          <Button
            variant="outline"
            onClick={() => setBulkOpen(true)}
            className="h-11 shrink-0 sm:hidden"
            aria-label="ייבוא מרובה"
          >
            <Upload className="h-4 w-4" />
            <span>ייבוא</span>
          </Button>
        </div>
      </div>

      {employeesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : employeesQuery.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          טעינת עובדים נכשלה: {errorMessage(employeesQuery.error)}
        </div>
      ) : (
        <MobileTable
          data={filtered}
          keyFn={(e) => e.id}
          columns={columns}
          emptyState={<span>אין עובדים להצגה</span>}
        />
      )}

      {/* Mobile FAB — same handler as the desktop "הוסף עובד/ת" button */}
      <FloatingActionButton
        icon={<Plus className="h-6 w-6" />}
        label="הוסף עובד/ת"
        onClick={startCreate}
      />

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ייבוא מרובה של עובדים</DialogTitle>
            <DialogDescription>
              שורה אחת לכל עובד/ת — שם, טלפון, תפקיד (מופרדים בפסיק/טאב/מקף).
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"דנה, 0501111111, מלצרית\nאיתי, 0502222222, ברמן"}
            rows={8}
            dir="rtl"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {bulkPreview.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border text-sm">
              <ul className="divide-y">
                {bulkPreview.map((row, i) => (
                  <li key={i} className="flex justify-between gap-2 px-3 py-2">
                    <span className="font-medium">{row.fullName}</span>
                    <span className="text-muted-foreground">
                      {row.phone ?? "—"} · {row.role ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkOpen(false)}
              disabled={bulkSubmitting}
            >
              ביטול
            </Button>
            <Button
              onClick={runBulkImport}
              disabled={bulkPreview.length === 0 || bulkSubmitting}
            >
              {bulkSubmitting
                ? "מייבא…"
                : `אישור (${bulkPreview.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-[90%] sm:w-3/4 overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "עריכת עובד/ת" : "עובד/ת חדש/ה"}</SheetTitle>
            <SheetDescription>
              שדות עם כוכבית הם חובה.
            </SheetDescription>
          </SheetHeader>
          <EmployeeForm
            initial={editing}
            onSubmit={onSubmit}
            onCancel={() => setSheetOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
