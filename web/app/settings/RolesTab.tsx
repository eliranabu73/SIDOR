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
    if (!window.confirm(`האם למחוק תפקיד ${role.name}?`)) return;
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
          <p className="text-sm text-muted-foreground">אין תפקידים עדיין.</p>
        )}
        {settings?.roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center gap-2 rounded-md border border-border p-2"
          >
            {editingRole === role.id ? (
              <>
                <Input
                  value={editingRoleName}
                  onChange={(e) => setEditingRoleName(e.target.value)}
                  className="h-8 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveRole(role.id);
                    if (e.key === "Escape") setEditingRole(null);
                  }}
                />
                <Button
                  size="sm"
                  variant="glow"
                  onClick={() => void saveRole(role.id)}
                  disabled={roleBusy === role.id}
                  className="h-8"
                >
                  {roleBusy === role.id ? "שומר…" : "שמור"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingRole(null)}
                  disabled={roleBusy === role.id}
                  className="h-8"
                >
                  ביטול
                </Button>
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4 shrink-0 text-indigo-500" />
                <span className="flex-1 text-sm font-medium">{role.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingRole(role.id);
                    setEditingRoleName(role.name);
                  }}
                  className="h-8"
                >
                  ערוך
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void doDeleteRole(role)}
                  disabled={roleBusy === role.id}
                  className="h-8 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <Input
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="שם תפקיד חדש"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") void addRole();
            }}
          />
          <Button
            variant="outline"
            onClick={addRole}
            disabled={!newRoleName.trim() || addingRole}
          >
            <PlusCircle className="me-1 h-4 w-4" />
            {addingRole ? "מוסיף…" : "הוסף"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
