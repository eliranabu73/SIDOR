import { ImageResponse } from "next/og";
import bidiFactory from "bidi-js";

export const runtime = "edge";
export const alt = "סידור4S — סידור עבודה אוטומטי בעברית";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori renders LTR only — convert Hebrew logical→visual order via Unicode BiDi.
const _bidi = bidiFactory();
function vis(str: string): string {
  if (!str) return str;
  const levels = _bidi.getEmbeddingLevels(str, "rtl");
  return _bidi.getReorderedString(str, levels);
}

async function loadHeebo(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl =
      "https://fonts.googleapis.com/css2?family=Heebo:wght@700;800&text=" +
      encodeURIComponent(text);
    const cssRes = await fetch(cssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/src:\s*url\((https:[^)]+\.woff2)\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function Image() {
  const brandHeb = vis("סידור");
  const tagline = vis("סידור עבודה אוטומטי בעברית");
  const subTagline = vis("חכם · מהיר · בעברית");

  const fontData = await loadHeebo(
    "סידור4Sסידור עבודה אוטומטי בעברית חכם מהיר",
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          fontFamily: "Heebo, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow blobs */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -200,
            left: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(6,182,212,0.20) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Main content row */}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 72,
            padding: "0 80px",
          }}
        >
          {/* Logo icon — recreated as JSX (gradient box + schedule lines) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 220,
              height: 220,
              borderRadius: 44,
              background: "linear-gradient(135deg, #6366f1 0%, #22d3ee 100%)",
              flexShrink: 0,
              boxShadow: "0 0 80px rgba(99,102,241,0.5)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 24,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 110,
                  height: 16,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.95)",
                }}
              />
              <div
                style={{
                  width: 110,
                  height: 16,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.95)",
                }}
              />
              <div
                style={{
                  width: 80,
                  height: 16,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.55)",
                }}
              />
            </div>
          </div>

          {/* Text block */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {/* Brand name: "סידור" white + "4S" gradient color */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "baseline",
                gap: 0,
              }}
            >
              <span
                style={{
                  fontSize: 130,
                  fontWeight: 800,
                  color: "#ffffff",
                  letterSpacing: -2,
                  lineHeight: 1,
                }}
              >
                {brandHeb}
              </span>
              <span
                style={{
                  fontSize: 130,
                  fontWeight: 800,
                  color: "#22d3ee",
                  letterSpacing: -2,
                  lineHeight: 1,
                }}
              >
                4S
              </span>
            </div>

            {/* Tagline */}
            <div
              style={{
                fontSize: 46,
                fontWeight: 700,
                color: "rgba(255,255,255,0.75)",
                marginTop: 8,
              }}
            >
              {tagline}
            </div>

            {/* Pills row */}
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                gap: 16,
                marginTop: 28,
              }}
            >
              {["WhatsApp", vis("ניהול משמרות"), vis("עברית מלאה")].map(
                (label) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      paddingLeft: 20,
                      paddingRight: 20,
                      paddingTop: 10,
                      paddingBottom: 10,
                      borderRadius: 999,
                      border: "1.5px solid rgba(99,102,241,0.5)",
                      background: "rgba(99,102,241,0.12)",
                      color: "#a5b4fc",
                      fontSize: 28,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: "Heebo", data: fontData, style: "normal", weight: 800 }]
        : undefined,
    },
  );
}
