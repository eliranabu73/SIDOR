import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { RegisterSW } from "@/components/pwa/register-sw";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

// iOS PWA splash screens (apple-touch-startup-image). Apple matches each
// link via media query — device-width/height in CSS px + pixel ratio.
const APPLE_SPLASHES = [
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 },  // iPhone 14 Pro Max
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 },  // iPhone 14 Pro
  { w: 1284, h: 2778, dw: 428, dh: 926, dpr: 3 },  // iPhone 14 Plus / 13 Pro Max
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 },  // iPhone 13 / 14
  { w: 1080, h: 2340, dw: 375, dh: 812, dpr: 3 },  // iPhone 13 mini / 12 mini
  { w: 828,  h: 1792, dw: 414, dh: 896, dpr: 2 },  // iPhone 11 / XR
  { w: 750,  h: 1334, dw: 375, dh: 667, dpr: 2 },  // iPhone SE 2/3
  { w: 2048, h: 2732, dw: 1024, dh: 1366, dpr: 2 }, // iPad Pro 12.9"
] as const;

const appleStartupIcons = APPLE_SPLASHES.map(({ w, h, dw, dh, dpr }) => ({
  rel: "apple-touch-startup-image",
  url: `/splash/iphone-${w}x${h}.png`,
  media: `(device-width: ${dw}px) and (device-height: ${dh}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
}));

export const metadata: Metadata = {
  title: "סידור4S — סידורי עבודה חכמים",
  description: "ניהול סידורי עבודה, שיבוצים אוטומטיים והחלפות משמרות",
  manifest: "/manifest.json",
  applicationName: "סידור4S",
  appleWebApp: {
    capable: true,
    title: "סידור4S",
    statusBarStyle: "black-translucent",
    startupImage: appleStartupIcons.map(({ url, media }) => ({ url, media })),
  },
  icons: {
    icon: "/logo-mark.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

// Inline pre-paint script — sets data-theme before first render to avoid FOUC.
const noFlashScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <Providers>{children}</Providers>
        <RegisterSW />
      </body>
    </html>
  );
}
