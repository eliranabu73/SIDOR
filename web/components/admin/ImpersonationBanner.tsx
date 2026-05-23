"use client";

import * as React from "react";

const TOKEN_KEY = "impersonation_token";
const NAME_KEY = "impersonation_target_name";

export function ImpersonationBanner() {
  const [name, setName] = React.useState<string | null>(null);

  React.useEffect(() => {
    const read = () => {
      try {
        const token = window.localStorage.getItem(TOKEN_KEY);
        const targetName = window.localStorage.getItem(NAME_KEY);
        setName(token ? targetName || "משתמש" : null);
      } catch {
        setName(null);
      }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY || e.key === NAME_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const stop = React.useCallback(() => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(NAME_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  }, []);

  if (!name) return null;

  return (
    <div
      role="alert"
      dir="rtl"
      className="sticky top-0 z-[60] flex w-full items-center justify-center gap-3 border-b border-amber-500/40 bg-amber-400/95 px-4 py-2 text-sm font-medium text-amber-950 shadow-sm backdrop-blur"
    >
      <span aria-hidden="true">🎭</span>
      <span>
        מציג כ-<span className="font-semibold">{name}</span> · חזור לחשבון שלך
      </span>
      <button
        type="button"
        onClick={stop}
        className="ms-2 rounded-md border border-amber-900/30 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-900/40"
      >
        חזור
      </button>
    </div>
  );
}
