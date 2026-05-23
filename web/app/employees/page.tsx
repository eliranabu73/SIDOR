"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell } from "@/components/layout/AppShell";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { EmployeeForm, type EmployeeFormData } from "@/components/employees/EmployeeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  useCreateEmployee,
  useDeleteEmployee,
  useEmployees,
  useRoles,
  useUpdateEmployee,
} from "@/lib/queries";
import { createRole as apiCreateRole } from "@/lib/api";
import type { CreateEmployeeBody, UpdateEmployeeBody, RoleItem } from "@/lib/api";
import type { Employee } from "@/lib/types";

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

function EmployeesInner() {
  const employeesQuery = useEmployees();
  const rolesQuery = useRoles();
  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee();
  const deleteMut = useDeleteEmployee();
  const qc = useQueryClient();

  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<Employee | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-4">
        <h1 className="text-xl font-semibold">עובדים</h1>
        <div className="flex w-full sm:w-auto items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם…"
            className="flex-1 sm:w-56 sm:flex-none h-11 sm:h-9"
            aria-label="חיפוש עובד/ת"
          />
          <Button onClick={startCreate} className="h-11 sm:h-10 shrink-0">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">הוסף עובד/ת</span>
            <span className="sm:hidden">הוסף</span>
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
        <EmployeeTable
          employees={filtered}
          onEdit={startEdit}
          onToggleActive={toggleActive}
        />
      )}

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
