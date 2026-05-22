"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSupabase } from "@/lib/supabase";
import { toast } from "sonner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const nav: { href: string; label: string; icon: React.ReactNode }[] = [
    { href: "/schedule", label: "סידור עבודה", icon: <CalendarDays className="h-4 w-4" /> },
    { href: "/employees", label: "עובדים", icon: <Users className="h-4 w-4" /> },
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
      <header className="sticky top-0 z-30 border-b border-border bg-card/70 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
          <Link href="/schedule" aria-label="סידור4S">
            <Logo size={26} />
          </Link>
          <nav className="flex items-center gap-1" aria-label="ניווט ראשי">
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
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut} aria-label="יציאה">
            <LogOut className="h-4 w-4" />
            יציאה
          </Button>
        </div>
      </header>
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
