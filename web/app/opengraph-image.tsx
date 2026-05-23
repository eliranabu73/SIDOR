import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "סידור4S — סידור עבודה אוטומטי בעברית";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Dynamic root Open Graph image.
 *
 * Renders a gradient indigo→cyan card with the brand mark and tagline in
 * Hebrew. Hebrew glyphs require a Hebrew-supporting font in the ImageResponse
 * pipeline, so we fetch Heebo (a Google Fonts family already used by the app
 * UI) at request time and pass it via the `fonts` option. Note: Google's CSS2
 * endpoint serves WOFF2 by default; we ask for `text=` subset to keep the
 * payload small and use `font-display=swap` is not relevant here — Satori
 * needs the binary.
 */

async function loadHeebo(text: string): Promise<ArrayBuffer | null> {
  try {
    // Request a minimal subset covering our exact tagline + brand text.
    const cssUrl =
      "https://fonts.googleapis.com/css2?family=Heebo:wght@800&text=" +
      encodeURIComponent(text);
    const cssRes = await fetch(cssUrl, {
      headers: {
        // UA needed so Google serves woff2 (which Satori supports).
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
  const brand = "סידור4S";
  const tagline = "סידור עבודה אוטומטי בעברית";
  const fontData = await loadHeebo(brand + tagline);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #4f46e5 0%, #6366f1 45%, #06b6d4 100%)",
          color: "white",
          fontFamily: "Heebo, sans-serif",
          padding: 80,
          direction: "rtl",
        }}
      >
        {/* Decorative blurred orbs (Satori supports radial-gradient backgrounds) */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -120,
            width: 420,
            height: 420,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            right: -160,
            width: 520,
            height: 520,
            background:
              "radial-gradient(circle, rgba(6,182,212,0.45) 0%, rgba(6,182,212,0) 70%)",
            display: "flex",
          }}
        />

        <div
          style={{
            fontSize: 180,
            fontWeight: 800,
            letterSpacing: -2,
            display: "flex",
            textShadow: "0 4px 24px rgba(0,0,0,0.25)",
          }}
        >
          {brand}
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 56,
            fontWeight: 800,
            opacity: 0.95,
            display: "flex",
            textAlign: "center",
          }}
        >
          {tagline}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [
            {
              name: "Heebo",
              data: fontData,
              style: "normal",
              weight: 800,
            },
          ]
        : undefined,
    },
  );
}
