import * as React from "react";
import { LogoMark } from "./LogoMark";

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  className?: string;
};

export function Logo({ size = 28, withWordmark = true, className }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} />
      {withWordmark ? (
        <span className="text-base font-bold tracking-tight">
          סידור<span className="text-gradient-brand">4S</span>
        </span>
      ) : null}
    </span>
  );
}
