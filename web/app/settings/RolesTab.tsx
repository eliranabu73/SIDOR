"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronRight, PlusCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  updateOrgRole,
  deleteOrgRole,
  createRole,
  type OrgSettings,
  type OrgRole,
} from "@/lib/api";

export interface RolesTabProps {
  settings: OrgSettings | null;
  setSettings: React.Dispatch<React.SetStateAction<OrgSettings | null>>;
}

export default function RolesTab({ settings, setSettings }: RolesTabProps) {
  const [editingRole, setEditingRole] = React.useState<string | null>(null);
  const [editingRoleName, setEditingRoleName] = React.useState("");
  const [newRoleName, setNewRoleName] = React.useState("");
  const [roleBusy, setRoleBusy] = React.useState<string | null>(null);
  const [addingRole, setAddingRole] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<OrgRole | null>(null);

  const saveRole = async (id: string) => {
    if (!editingRoleName.trim()) {
      toast.error("שם תפקיד לא יכול להיות ריק");
      return;
    }
    setRoleBusy(id);
    try {
      const updated = await updateOrgRole(id, editingRoleName.trim());
      setSettings((s) =>
        s
          ? { ...s, roles: s.roles.map((r) => (r.id === id ? { ...r, name: updated.name } : r)) }
          : s,
      );
      setEditingRole(null);
      toast.success("תפקיד עודכן");
    } catch {
      toast.error("עדכון התפקיד נכשל");
    } finally {
      setRoleBusy(null);
    }
  };

  const doDeleteRole = async (role: OrgRole) => {
    setRoleBusy(role.id);
    try {
      await deleteOrgRole(role.id);
      setSettings((s) => (s ? { ...s, roles: s.roles.filter((r) => r.id !== role.id) } : s));
      toast.success("תפקיד נמחק");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "מחיקת התפקיד נכשלה";
      toast.error(msg);
    } finally {
      setRoleBusy(null);
      setPendingDelete(null);
    }
  };

  const addRole = async () => {
    if (!newRoleName.trim()) return;
    setAddingRole(true);
    try {
      const r = await createRole({ name: newRoleName.trim() });
      const newRole: OrgRole = { id: r.id, name: r.name, description: null };
      setSettings((s) => (s ? { ...s, roles: [...s.roles, newRole] } : s));
      setNewRoleName("");
      toast.success("תפקיד נוצר");
    } catch {
      toast.error("יצירת התפקיד נכשלה");
    } finally {
      setAddingRole(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>תפקידים</CardTitle>
        <CardDescription>
          הגדר את תפקידי העובדים בעסק — מלצר, טבח, מנהל, קופאי, כל מה שצריך.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings?.roles.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-8 text-center">
            <ChevronRight className="h-8 w-8 text-muted-foreground opacity-40" aria-hidden />
            <p className="text-sm font-medium">עדיין אין תפקידים</p>
            <p className="text-xs text-muted-foreground">
              הוסיפו תפקיד ראשון (למשל מלצר או טבח) כדי לשבץ עובדים לפי תפקיד.
            </p>
          </div>
        )}
        {settings?.roles.map((role) => (
          <div
            key={role.id}
            className="grid grid-cols-1 sm:flex sm:flex-nowrap sm:items-center gap-2 rounded-md border border-border p-2"
          >
            {editingRole === role.id ? (
              <>
                <Input
                  value={editingRoleName}
                  onChange={(e) => setEditingRoleName(e.target.value)}
                  className="h-9 flex-1"
                  aria-label="שם תפקיד"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRole(role.id);
                    if (e.key === "Escape") setEditingRole(null);
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="glow"
                    onClick={() => void saveRole(role.id)}
                    disabled={roleBusy === role.id}
                    className="h-9 flex-1 sm:flex-none"
                  >
                    {roleBusy === role.id ? "שומר…" : "שמור"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingRole(null)}
                    disabled={roleBusy === role.id}
                    className="h-9 flex-1 sm:flex-none"
                  >
                    ביטול
                  </Button>
                </div>
              </>
            ) : (
              <>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-indigo-500 sm:block" aria-hidden />
                <span className="flex-1 text-sm font-medium">{role.name}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingRole(role.id);
                      setEditingRoleName(role.name);
                    }}
                    className="h-9 flex-1 sm:flex-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    ערוך
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPendingDelete(role)}
                    disabled={roleBusy === role.id}
                    aria-label={`מחק תפקיד ${role.name}`}
                    className="h-9 text-destructive hover:text-destructive focus-visible:ring-2 focus-visible:ring-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Input
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="שם תפקיד חדש"
            aria-label="שם תפקיד חדש"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") void addRole();
            }}
          />
          <Button
            variant="outline"
            onClick={addRole}
            disabled={!newRoleName.trim() || addingRole}
            className="w-full sm:w-auto"
          >
            <PlusCircle className="me-1 h-4 w-4" />
            {addingRole ? "מוסיף…" : "הוסף"}
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="מחיקת תפקיד"
        description={
          pendingDelete
            ? `האם למחוק את התפקיד "${pendingDelete.name}"? פעולה זו אינה הפיכה.`
            : undefined
        }
        confirmLabel="מחק"
        destructive
        pending={pendingDelete ? roleBusy === pendingDelete.id : false}
        onConfirm={() => {
          if (pendingDelete) void doDeleteRole(pendingDelete);
        }}
      />
    </Card>
  );
}
