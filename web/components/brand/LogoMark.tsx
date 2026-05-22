import * as React from "react";

type LogoMarkProps = React.SVGProps<SVGSVGElement> & {
  size?: number;
};

/**
 * sidor4S brand glyph — rounded square, indigo→cyan gradient,
 * two stacked offset bars representing schedule rows.
 * Designed to be flat-vector & favicon-safe.
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
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#g-${id})`} />
      <rect x="10" y="16" width="22" height="5" rx="2" fill="white" opacity="0.95" />
      <rect x="16" y="27" width="22" height="5" rx="2" fill="white" opacity="0.95" />
    </svg>
  );
}
