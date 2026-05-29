import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Node.js runtime — needed to read logo PNG from filesystem.
// OG images are only fetched by scrapers/crawlers, never latency-critical.
export const runtime = "nodejs";

export const alt = "סידור4S — סידור עבודה אוטומטי בעברית";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const logoBuf = readFileSync(join(process.cwd(), "public", "logo2.png"));
  const logoDataUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoDataUrl}
          alt="סידור4S"
          width={1000}
          height={560}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    {
      ...size,
      headers: {
        // Prevent CDN/WhatsApp from caching stale versions
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}
