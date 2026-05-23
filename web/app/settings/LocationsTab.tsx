"use client";

import * as React from "react";
import { toast } from "sonner";
import { MapPin, PlusCircle, Trash2 } from "lucide-react";
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
  updateOrgLocation,
  deleteOrgLocation,
  createLocation,
  type OrgSettings,
  type OrgLocation,
} from "@/lib/api";

export interface LocationsTabProps {
  settings: OrgSettings | null;
  setSettings: React.Dispatch<React.SetStateAction<OrgSettings | null>>;
}

export default function LocationsTab({ settings, setSettings }: LocationsTabProps) {
  const [editingLocation, setEditingLocation] = React.useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = React.useState("");
  const [newLocationName, setNewLocationName] = React.useState("");
  const [locationBusy, setLocationBusy] = React.useState<string | null>(null);
  const [addingLocation, setAddingLocation] = React.useState(false);

  const saveLocation = async (id: string) => {
    if (!editingLocationName.trim()) {
      toast.error("שם סניף לא יכול להיות ריק");
      return;
    }
    setLocationBusy(id);
    try {
      const updated = await updateOrgLocation(id, editingLocationName.trim());
      setSettings((s) =>
        s
          ? {
              ...s,
              locations: s.locations.map((l) =>
                l.id === id ? { ...l, name: updated.name } : l,
              ),
            }
          : s,
      );
      setEditingLocation(null);
      toast.success("סניף עודכן");
    } catch {
      toast.error("שגיאה בעדכון");
    } finally {
      setLocationBusy(null);
    }
  };

  const doDeleteLocation = async (loc: OrgLocation) => {
    if (!window.confirm(`האם למחוק סניף ${loc.name}?`)) return;
    setLocationBusy(loc.id);
    try {
      await deleteOrgLocation(loc.id);
      setSettings((s) =>
        s ? { ...s, locations: s.locations.filter((l) => l.id !== loc.id) } : s,
      );
      toast.success("סניף נמחק");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "שגיאה במחיקה";
      toast.error(msg);
    } finally {
      setLocationBusy(null);
    }
  };

  const addLocation = async () => {
    if (!newLocationName.trim()) return;
    setAddingLocation(true);
    try {
      const l = await createLocation({ name: newLocationName.trim() });
      const newLoc: OrgLocation = {
        id: l.id,
        name: l.name,
        timezone: l.timezone ?? null,
        address: null,
      };
      setSettings((s) => (s ? { ...s, locations: [...s.locations, newLoc] } : s));
      setNewLocationName("");
      toast.success("סניף נוצר");
    } catch {
      toast.error("שגיאה ביצירה");
    } finally {
      setAddingLocation(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>סניפים / מיקומים</CardTitle>
        <CardDescription>הגדר את הסניפים שבהם מנוהל הסידור.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings?.locations.length === 0 && (
          <p className="text-sm text-muted-foreground">אין סניפים עדיין.</p>
        )}
        {settings?.locations.map((loc) => (
          <div
            key={loc.id}
            className="flex items-center gap-2 rounded-md border border-border p-2"
          >
            {editingLocation === loc.id ? (
              <>
                <Input
                  value={editingLocationName}
                  onChange={(e) => setEditingLocationName(e.target.value)}
                  className="h-8 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveLocation(loc.id);
                    if (e.key === "Escape") setEditingLocation(null);
                  }}
                />
                <Button
                  size="sm"
                  variant="glow"
                  onClick={() => void saveLocation(loc.id)}
                  disabled={locationBusy === loc.id}
                  className="h-8"
                >
                  {locationBusy === loc.id ? "שומר…" : "שמור"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingLocation(null)}
                  disabled={locationBusy === loc.id}
                  className="h-8"
                >
                  ביטול
                </Button>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 shrink-0 text-cyan-500" />
                <span className="flex-1 text-sm font-medium">{loc.name}</span>
                {loc.timezone && (
                  <span className="text-xs text-muted-foreground">{loc.timezone}</span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingLocation(loc.id);
                    setEditingLocationName(loc.name);
                  }}
                  className="h-8"
                >
                  ערוך
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void doDeleteLocation(loc)}
                  disabled={locationBusy === loc.id}
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
            value={newLocationName}
            onChange={(e) => setNewLocationName(e.target.value)}
            placeholder="שם סניף חדש"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") void addLocation();
            }}
          />
          <Button
            variant="outline"
            onClick={addLocation}
            disabled={!newLocationName.trim() || addingLocation}
          >
            <PlusCircle className="me-1 h-4 w-4" />
            {addingLocation ? "מוסיף…" : "הוסף"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
