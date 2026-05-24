import * as React from "react";
import Image from "next/image";
import { LogoMark } from "./LogoMark";

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

/**
 * Brand logo component.
 * withWordmark=true (default): renders the full PNG logo (icon + wordmark).
 * withWordmark=false: renders the SVG icon-only mark (used in favicons/tight spaces).
 */
export function Logo({ size = 28, withWordmark = true, className }: LogoProps) {
  if (!withWordmark) {
    return <LogoMark size={size} className={className} />;
  }

  // Full PNG logo — height = size * 2.5 gives a good aspect-ratio fit.
  // Width is calculated from the logo's natural ~1.9:1 aspect ratio.
  const h = size * 2.2;
  const w = Math.round(h * 1.9);

  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <Image
        src="/logo2.png"
        alt="sidor4S"
        width={w}
        height={h}
        priority
        style={{ height: h, width: "auto" }}
        className="select-none"
      />
    </span>
  );
}
