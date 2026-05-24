"use client";

import * as React from "react";
import { toast } from "sonner";
import { Users, Edit2, X, Check } from "lucide-react";
import {
  fetchOrgMembers,
  fetchSettings,
  patchMemberRole,
  type OrgMember,
  type OrgLocation,
} from "@/lib/api";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "בעלים",
  MANAGER: "מנהל",
  BRANCH_MANAGER: "מנהל סניף",
};

const ROLE_BADGE: Record<string, string> = {
  OWNER: "bg-indigo-100 text-indigo-700 border-indigo-200",
  MANAGER: "bg-blue-100 text-blue-700 border-blue-200",
  BRANCH_MANAGER: "bg-teal-100 text-teal-700 border-teal-200",
};

interface EditState {
  userId: string;
  role: "MANAGER" | "BRANCH_MANAGER";
  locationId?: string;
}

export function MembersTable() {
  const [members, setMembers] = React.useState<OrgMember[]>([]);
  const [locations, setLocations] = React.useState<OrgLocation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<EditState | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [mems, settings] = await Promise.all([fetchOrgMembers(), fetchSettings()]);
      setMembers(mems);
      setLocations(settings.locations);
    } catch {
      toast.error("שגיאה בטעינת חברי הצוות");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (member: OrgMember) => {
    if (member.role === "OWNER") return;
    setEditing({
      userId: member.userId,
      role: member.role === "BRANCH_MANAGER" ? "BRANCH_MANAGER" : "MANAGER",
      locationId: member.locationId ?? undefined,
    });
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    if (editing.role === "BRANCH_MANAGER" && !editing.locationId) {
      toast.error("יש לבחור סניף עבור מנהל סניף");
      return;
    }
    setSaving(true);
    try {
      const updated = await patchMemberRole(
        editing.userId,
        editing.role,
        editing.role === "BRANCH_MANAGER" ? editing.locationId : undefined,
      );
      setMembers((prev) =>
        prev.map((m) => (m.userId === updated.userId ? updated : m)),
      );
      setEditing(null);
      toast.success("הרשאות עודכנו בהצלחה");
    } catch {
      toast.error("שמירת ההרשאות נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-indigo-500/30 border-t-indigo-500" />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
        <Users className="h-8 w-8 opacity-40" />
        <p className="text-sm">אין חברי צוות עדיין</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-muted-foreground">
            <th className="px-4 py-2.5 text-right font-medium">משתמש</th>
            <th className="px-4 py-2.5 text-right font-medium">תפקיד מערכת</th>
            <th className="px-4 py-2.5 text-right font-medium">סניף</th>
            <th className="w-10 px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const isEditing = editing?.userId === member.userId;
            return (
              <tr key={member.id} className="border-b last:border-0 hover:bg-muted/20">
                {/* User ID (we don't have display name from this endpoint) */}
                <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                  {member.userId.slice(0, 8)}…
                </td>

                {/* Role */}
                <td className="px-4 py-3">
                  {isEditing ? (
                    <select
                      value={editing.role}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev
                            ? { ...prev, role: e.target.value as "MANAGER" | "BRANCH_MANAGER", locationId: undefined }
                            : prev
                        )
                      }
                      className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="MANAGER">מנהל</option>
                      <option value="BRANCH_MANAGER">מנהל סניף</option>
                    </select>
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[member.role] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  )}
                </td>

                {/* Location */}
                <td className="px-4 py-3">
                  {isEditing && editing.role === "BRANCH_MANAGER" ? (
                    <select
                      value={editing.locationId ?? ""}
                      onChange={(e) =>
                        setEditing((prev) =>
                          prev ? { ...prev, locationId: e.target.value || undefined } : prev
                        )
                      }
                      className="rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- בחר סניף --</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-muted-foreground">
                      {member.location?.name ?? (member.role === "BRANCH_MANAGER" ? "לא הוגדר" : "—")}
                    </span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  {member.role === "OWNER" ? null : isEditing ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={saveEdit}
                        disabled={saving}
                        aria-label="שמור"
                        className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        aria-label="ביטול"
                        className="rounded p-1 text-muted-foreground hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(member)}
                      aria-label="ערוך הרשאות"
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
