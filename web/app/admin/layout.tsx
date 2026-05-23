"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  ClipboardList,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSupabase } from "@/lib/supabase";
import { toast } from "sonner";
import { AdminGuard } from "@/components/auth/AdminGuard";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const nav: NavItem[] = [
    { href: "/admin", label: "סקירה", icon: <BarChart3 className="h-5 w-5" /> },
    { href: "/admin/orgs", label: "ארגונים", icon: <Building2 className="h-5 w-5" /> },
    { href: "/admin/users", label: "משתמשים", icon: <Users className="h-5 w-5" /> },
    { href: "/admin/audit", label: "יומן ביקורת", icon: <ClipboardList className="h-5 w-5" /> },
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

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname?.startsWith(href);

  return (
    <AdminGuard>
      <div className="min-h-screen flex flex-col" dir="rtl">
        <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
            <Link href="/admin" aria-label="פאנל ניהול" className="flex items-center gap-2">
              <Logo size={26} />
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                ניהול מערכת
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1" aria-label="ניווט ניהול">
              {nav.map((item) => {
                const active = isActive(item.href);
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
            <Link
              href="/schedule"
              className="hidden sm:inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              חזרה לאפליקציה
            </Link>
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

        {/* Mobile bottom tab bar */}
        <nav
          className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md"
          aria-label="ניווט תחתון"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="grid grid-cols-4">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href} className="contents">
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors touch-target",
                      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
    </AdminGuard>
  );
}
