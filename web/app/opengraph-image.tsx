import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// nodejs runtime so we can read the logo file from disk.
// OG images are fetched by link-preview scrapers only — not latency-sensitive.
export const runtime = "nodejs";

export const alt = "סידור4S — סידור עבודה אוטומטי בעברית";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const logoBuf = readFileSync(join(process.cwd(), "public", "logo2.png"));
  const logoSrc = `data:image/png;base64,${logoBuf.toString("base64")}`;

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
          src={logoSrc}
          alt="סידור4S"
          width={980}
          height={540}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
