/**
 * Site-wide constants for SEO, Open Graph, manifest, and structured data.
 *
 * Read once at build/render time. SITE_URL is overridable via the
 * NEXT_PUBLIC_SITE_URL env var so preview deployments can self-reference
 * correctly; the fallback is the production Vercel domain.
 */

export const SITE_URL: string =
  (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://sidor-eta.vercel.app");

export const SITE_NAME = "סידור4S";

export const SITE_DESCRIPTION =
  "תוכנה לסידור עבודה — אוטומטית, בעברית, דרך WhatsApp";

export const LOCALE = "he_IL";

export const SOCIAL = {
  twitter: "https://twitter.com/sidor4s",
  facebook: "https://www.facebook.com/sidor4s",
  linkedin: "https://www.linkedin.com/company/sidor4s",
} as const;

/** Default OG image — static file served from /public. */
export const OG_IMAGE_PATH = "/og-image.png";

/** Absolute URL for the default OG image. */
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`;

/** Twitter handle (without leading @) for twitter card attribution. */
export const TWITTER_HANDLE = "@sidor4s";
