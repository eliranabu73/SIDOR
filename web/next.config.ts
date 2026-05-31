import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {
    // Tree-shake big barrel/icon packages so each route only ships the symbols
    // it actually imports — cuts JS sent on first load (pages were >3s).
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "luxon",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "date-fns",
    ],
  },
};

// Wrap with Sentry only when DSN is present — keeps deploys working when
// the secret hasn't been provisioned yet.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: "sidor-y7",
      project: "sidor-web",
      sourcemaps: { disable: true },
    })
  : nextConfig;
