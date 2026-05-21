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
import { useEmployees } from "@/lib/queries";
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

function EmployeesInner() {
  const employeesQuery = useEmployees();
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

  const onSubmit = async (_data: EmployeeFormData) => {
    // TODO(integration): POST /v1/employees or PATCH /v1/employees/:id
    toast.success(editing ? "העובד/ת עודכן/ה" : "העובד/ת נוסף/ה");
    setSheetOpen(false);
  };

  const toggleActive = (employee: Employee) => {
    // TODO(integration): PATCH /v1/employees/:id { active }
    toast.success(
      employee.active
        ? `${employee.fullName} הושבת/ה`
        : `${employee.fullName} הופעל/ה`,
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold">עובדים</h1>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם…"
            className="w-56"
            aria-label="חיפוש עובד/ת"
          />
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            הוסף עובד/ת
          </Button>
        </div>
      </div>

      {employeesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <EmployeeTable
          employees={filtered}
          onEdit={startEdit}
          onToggleActive={toggleActive}
        />
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left">
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
