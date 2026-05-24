"use client";

import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";

/**
 * Shows a dismissible install-to-home-screen banner on mobile.
 * Uses the `beforeinstallprompt` event (Chrome/Android).
 * On iOS the banner is suppressed — iOS handles "Add to Home Screen" via
 * the Safari share sheet, not the Web Install API.
 */
export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed by the user.
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Only show on narrow-viewport devices.
    if (window.innerWidth >= 768) return;

    // Don't show when already running as a standalone PWA.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="התקנת אפליקציה"
      className="fixed bottom-20 inset-x-3 z-50 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl sm:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Download className="h-5 w-5" aria-hidden />
      </span>

      <p className="flex-1 text-sm font-medium leading-snug text-foreground">
        התקן את האפליקציה על הטלפון שלך
      </p>

      <Button
        size="sm"
        className="shrink-0 h-8 px-3 text-xs"
        onClick={handleInstall}
        aria-label="התקן את סידור4S"
      >
        התקן
      </Button>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="סגור"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
