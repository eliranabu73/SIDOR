import * as React from "react";

type LogoMarkProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

/**
 * sidor4S brand glyph (v2).
 * - Rounded square base with indigo→cyan gradient + subtle inner highlight
 * - A 3×3 micro-grid (schedule cells) inside, with one row filled in solid
 *   white and two rows as outlined "available slots"
 * - Tiny accent dot in top-right corner = "live" indicator
 *
 * Designed at 48×48 viewbox; scales cleanly down to 16×16 (favicon) and up to
 * 128×128 (app icon).
 */
export function LogoMark({ size = 32, ...props }: LogoMarkProps) {
  const id = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="50%" stopColor="#7C5CF5" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
        <linearGradient id={`gloss-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="55%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`dot-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </radialGradient>
      </defs>

      {/* Base */}
      <rect width="48" height="48" rx="12" fill={`url(#bg-${id})`} />
      {/* Glass highlight on the top half */}
      <rect width="48" height="48" rx="12" fill={`url(#gloss-${id})`} />

      {/* 3x3 micro-grid representing schedule rows.
          Cells: 10×4, gap 2. Total grid: 34×16, centered at (7,16). */}
      {/* Row 1 — outlined (open slots) */}
      <g fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="1.2">
        <rect x="7" y="14" width="10" height="4" rx="1.2" />
        <rect x="19" y="14" width="10" height="4" rx="1.2" />
        <rect x="31" y="14" width="10" height="4" rx="1.2" />
      </g>
      {/* Row 2 — solid (assigned) */}
      <g fill="white" fillOpacity="0.95">
        <rect x="7" y="22" width="10" height="4" rx="1.2" />
        <rect x="19" y="22" width="10" height="4" rx="1.2" />
        <rect x="31" y="22" width="10" height="4" rx="1.2" />
      </g>
      {/* Row 3 — mixed: 2 solid + 1 outlined */}
      <g>
        <rect x="7" y="30" width="10" height="4" rx="1.2" fill="white" fillOpacity="0.95" />
        <rect
          x="19"
          y="30"
          width="10"
          height="4"
          rx="1.2"
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="1.2"
        />
        <rect x="31" y="30" width="10" height="4" rx="1.2" fill="white" fillOpacity="0.95" />
      </g>

      {/* "Live" accent dot — emerald, top-right */}
      <circle cx="38.5" cy="9.5" r="3" fill={`url(#dot-${id})`} />
      <circle cx="38.5" cy="9.5" r="3" fill="white" fillOpacity="0.15" />
    </svg>
  );
}
