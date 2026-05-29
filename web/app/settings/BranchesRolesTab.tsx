"use client";

import * as React from "react";
import LocationsTab from "./LocationsTab";
import RolesTab from "./RolesTab";
import type { OrgSettings } from "@/lib/api";

export interface BranchesRolesTabProps {
  settings: OrgSettings | null;
  setSettings: React.Dispatch<React.SetStateAction<OrgSettings | null>>;
}

/**
 * Combined "סניפים ותפקידים" tab.
 *
 * Two stacked cards on mobile; side-by-side on `sm+`. The inner tabs are
 * unchanged self-contained Card components so visual + logic parity is
 * preserved while reducing the top-level tab count from 5 → 3.
 */
export default function BranchesRolesTab({
  settings,
  setSettings,
}: BranchesRolesTabProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <LocationsTab settings={settings} setSettings={setSettings} />
      <RolesTab settings={settings} setSettings={setSettings} />
    </div>
  );
}
