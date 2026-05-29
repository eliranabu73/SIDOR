import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "סידור4S — סידור עבודה אוטומטי בעברית";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const text = "סידור עבודה אוטומטי בעברית4S";
    const cssUrl =
      "https://fonts.googleapis.com/css2?family=Heebo:wght@800&text=" +
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

async function loadLogo(): Promise<string | null> {
  try {
    // Fetch logo2.png from the public folder via import.meta.url (edge-compatible)
    const logoRes = await fetch(
      new URL("../public/logo2.png", import.meta.url),
    );
    if (!logoRes.ok) return null;
    const buf = await logoRes.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

export default async function Image() {
  const [fontData, logoDataUrl] = await Promise.all([loadFont(), loadLogo()]);

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
          fontFamily: "Heebo, sans-serif",
        }}
      >
        {logoDataUrl ? (
          /* Show actual logo centered, large */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            alt="סידור4S"
            style={{
              maxWidth: 900,
              maxHeight: 500,
              objectFit: "contain",
            }}
          />
        ) : (
          /* Fallback if logo fails to load */
          <div
            style={{
              fontSize: 100,
              fontWeight: 800,
              color: "#4f46e5",
              display: "flex",
            }}
          >
            סידור4S
          </div>
        )}
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
