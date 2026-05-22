import type { NextConfig } from "next";
import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
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
