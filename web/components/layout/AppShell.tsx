"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarDays,
  CircleDollarSign,
  Clock,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  LogOut,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSupabase } from "@/lib/supabase";
import { adminApi } from "@/lib/api";
import { toast } from "sonner";
import { PwaInstallBanner } from "@/components/pwa/PwaInstallBanner";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Platform-admin check — only the SaaS owner sees the admin link.
  // Failures (403/401) are swallowed so non-admins simply don't see it.
  const adminCheck = useQuery({
    queryKey: ["admin", "check"],
    queryFn: () => adminApi.check().catch(() => ({ isAdmin: false })),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const isAdmin = adminCheck.data?.isAdmin === true;

  // Tips feature is optional — only restaurants/bars typically need it.
  // Controlled via localStorage flag toggled from settings > general.
  const [showTips, setShowTips] = React.useState<boolean>(false);
  React.useEffect(() => {
    try {
      setShowTips(localStorage.getItem("sidor_show_tips") === "true");
    } catch {
      setShowTips(false);
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sidor_show_tips") {
        setShowTips(e.newValue === "true");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const nav: NavItem[] = [
    { href: "/schedule", label: "סידור עבודה", icon: <CalendarDays className="h-5 w-5" /> },
    { href: "/employees", label: "עובדים", icon: <Users className="h-5 w-5" /> },
    { href: "/swaps", label: "החלפות", icon: <ArrowLeftRight className="h-5 w-5" /> },
    { href: "/fairness", label: "הוגנות", icon: <Scale className="h-5 w-5" /> },
    ...(showTips
      ? [{ href: "/tips", label: "חלוקת טיפים", icon: <CircleDollarSign className="h-5 w-5" /> }]
      : []),
    { href: "/timetracking", label: "נוכחות", icon: <Clock className="h-5 w-5" /> },
    { href: "/settings", label: "הגדרות", icon: <Settings className="h-5 w-5" /> },
  ];

  const signOut = async () => {
    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch {
      toast.error("שגיאה ביציאה");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
          <Link href="/schedule" aria-label="סידור4S" className="flex items-center">
            <Logo size={26} />
          </Link>
          <nav className="hidden sm:flex items-center gap-1" aria-label="ניווט ראשי">
            {nav.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="me-auto" />
          {isAdmin && (
            <Link
              href="/admin"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
              aria-label="ניהול מערכת"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              ניהול מערכת
            </Link>
          )}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            aria-label="יציאה"
            className="h-11 sm:h-9"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">יציאה</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 pb-16 sm:pb-0">{children}</main>

      <PwaInstallBanner />

      {/* Mobile bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md"
        aria-label="ניווט תחתון"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className={cn("grid", showTips ? "grid-cols-7" : "grid-cols-6")}>
          {nav.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <li key={item.href} className="contents">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors touch-target",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-md px-2 py-0.5",
                      active && "bg-primary/10",
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="leading-tight">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
