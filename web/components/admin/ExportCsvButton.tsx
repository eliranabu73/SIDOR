"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import { getAccessToken } from "@/lib/supabase";
import { toast } from "sonner";

export function ExportCsvButton({
  type,
  label = "ייצא CSV",
}: {
  type: "orgs" | "users" | "audit";
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  const handle = React.useCallback(async () => {
    setBusy(true);
    try {
      const url = adminApi.exportCsv(type);
      // Prefer impersonation token if set; else use the user's Supabase JWT.
      let token: string | null = null;
      try {
        token = window.localStorage.getItem("impersonation_token");
      } catch {
        token = null;
      }
      if (!token) token = await getAccessToken();
      const res = await fetch(url, {
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast.error("ייצוא ה-CSV נכשל");
      console.error(err);
    } finally {
      setBusy(false);
    }
  }, [type]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handle}
      disabled={busy}
      className="gap-1.5"
    >
      <Download className="h-4 w-4" />
      {busy ? "מייצא…" : label}
    </Button>
  );
}
