"use client";

import * as React from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Copy, RefreshCw, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchEmployees,
  fetchSettings,
  promoteEmployeeToManager,
  type PromoteEmployeeResponse,
} from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingMemberUserIds: Set<string>;
  onPromoted: (resp: PromoteEmployeeResponse) => void;
}

function generatePassword(len = 14): string {
  // Browser-safe random password with mixed case + digits + symbols.
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += charset[arr[i]! % charset.length];
  }
  return out;
}

export function PromoteEmployeeDialog({
  open,
  onOpenChange,
  existingMemberUserIds,
  onPromoted,
}: Props) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [role, setRole] = React.useState<"MANAGER" | "BRANCH_MANAGER">("MANAGER");
  const [locationId, setLocationId] = React.useState("");
  const [password, setPassword] = React.useState(() => generatePassword());
  const [saving, setSaving] = React.useState(false);

  const employeesQ = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
    enabled: open,
    staleTime: 60_000,
  });
  const settingsQ = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  React.useEffect(() => {
    if (open) {
      setEmployeeId("");
      setRole("MANAGER");
      setLocationId("");
      setPassword(generatePassword());
    }
  }, [open]);

  const eligibleEmployees = React.useMemo(() => {
    return (employeesQ.data ?? []).filter(
      (e) =>
        e.email &&
        e.active &&
        // Hide employees that already have a Membership in this org.
        // (Employee.userId is set after promotion; we also exclude by membership list.)
        !existingMemberUserIds.has(e.id),
    );
  }, [employeesQ.data, existingMemberUserIds]);

  const selectedEmployee = eligibleEmployees.find((e) => e.id === employeeId);

  const canSubmit =
    !!selectedEmployee &&
    !!selectedEmployee.email &&
    password.length >= 8 &&
    (role === "MANAGER" || (role === "BRANCH_MANAGER" && !!locationId));

  const submit = async () => {
    if (!canSubmit || !selectedEmployee) return;
    setSaving(true);
    try {
      const resp = await promoteEmployeeToManager({
        employeeId: selectedEmployee.id,
        password,
        role,
        locationId: role === "BRANCH_MANAGER" ? locationId : undefined,
      });
      onPromoted(resp);
      toast.success("העובד הפך למנהל בהצלחה");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה ביצירת מנהל";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const copyPassword = () => {
    void navigator.clipboard.writeText(password);
    toast.success("הסיסמה הועתקה");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            הפוך עובד למנהל
          </DialogTitle>
          <DialogDescription>
            בחר עובד קיים, הגדר תפקיד מערכת, וצור עבורו סיסמה כדי לאפשר לו להיכנס למערכת.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="employee">עובד</Label>
            <select
              id="employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              disabled={employeesQ.isLoading}
            >
              <option value="">— בחר עובד —</option>
              {eligibleEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.email})
                </option>
              ))}
            </select>
            {!employeesQ.isLoading && eligibleEmployees.length === 0 && (
              <p className="text-xs text-muted-foreground">
                אין עובדים זמינים עם כתובת אימייל שעדיין לא מוגדרים כמנהלים.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="role">תפקיד מערכת</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => {
                const next = e.target.value as "MANAGER" | "BRANCH_MANAGER";
                setRole(next);
                if (next === "MANAGER") setLocationId("");
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="MANAGER">מנהל (כל הסניפים)</option>
              <option value="BRANCH_MANAGER">מנהל סניף</option>
            </select>
          </div>

          {role === "BRANCH_MANAGER" && (
            <div className="space-y-1">
              <Label htmlFor="branch">סניף</Label>
              <select
                id="branch"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">— בחר סניף —</option>
                {settingsQ.data?.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="password">סיסמה ראשונית</Label>
            <div className="flex items-center gap-2">
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono text-sm tracking-wider"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPassword(generatePassword())}
                aria-label="צור סיסמה חדשה"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyPassword}
                aria-label="העתק סיסמה"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              העבר את הסיסמה לעובד דרך ערוץ אישי. הוא יוכל לשנות אותה אחרי הכניסה.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button variant="glow" disabled={!canSubmit || saving} onClick={submit}>
            {saving ? "יוצר…" : "צור משתמש"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
