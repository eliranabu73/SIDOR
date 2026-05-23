"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only.
 * Dev disables SW to avoid stale-bundle pain during HMR.
 */
export function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Non-fatal — app still works without offline support.
        // eslint-disable-next-line no-console
        console.warn("SW registration failed:", err);
      });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
