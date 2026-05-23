import type { Metadata, Viewport } from "next";

/**
 * WS-I — Employee Self-Service mini-app layout.
 *
 * Route segment group (employee) deliberately bypasses the authenticated
 * app shell: no AuthGuard, no ImpersonationBanner, no Providers chrome that
 * implies "you're logged in". The page is reachable only via a 90-day
 * HMAC-signed share token issued by a manager.
 *
 * Note: Next.js App Router only renders one <html> element (from the root
 * layout). This nested layout is a pure server wrapper.
 */

export const metadata: Metadata = {
  title: "המשמרות שלי · סידור4S",
  description: "הצגת משמרות, בקשת חופש ועדכון זמינות — אישי לעובד",
  manifest: "/manifest.json",
  applicationName: "סידור4S — עובד",
  appleWebApp: {
    capable: true,
    title: "סידור4S",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function EmployeePortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className="employee-portal-shell">{children}</div>;
}
