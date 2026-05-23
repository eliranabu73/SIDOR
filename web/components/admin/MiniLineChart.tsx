"use client";

import * as React from "react";

export interface MiniLineChartPoint {
  date: string;
  count: number;
}

export interface MiniLineChartProps {
  data: MiniLineChartPoint[];
  height?: number;
  stroke?: string;
  fill?: string;
  ariaLabel?: string;
}

/**
 * Lightweight inline SVG line chart with gradient fill.
 * Avoids pulling in recharts; ~no runtime cost.
 */
export function MiniLineChart({
  data,
  height = 140,
  stroke = "var(--color-primary, #6366f1)",
  fill = "var(--color-primary, #6366f1)",
  ariaLabel = "תרשים",
}: MiniLineChartProps) {
  const width = 600; // viewBox width; SVG scales to container
  const pad = { top: 8, right: 8, bottom: 18, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        אין נתונים
      </div>
    );
  }

  const max = Math.max(1, ...data.map((d) => d.count));
  const min = 0;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = pad.left + i * stepX;
    const y =
      pad.top + innerH - ((d.count - min) / (max - min || 1)) * innerH;
    return { x, y, d };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(
    1,
  )},${(pad.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)},${(
    pad.top + innerH
  ).toFixed(1)} Z`;

  const total = data.reduce((acc, d) => acc + d.count, 0);
  const gradId = React.useId();

  // Tick labels: show first, middle, last date
  const ticks = [
    points[0],
    points[Math.floor(points.length / 2)],
    points[points.length - 1],
  ];

  return (
    <svg
      role="img"
      aria-label={`${ariaLabel} (סה"כ ${total})`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="0.35" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Y baseline + max gridline */}
      <line
        x1={pad.left}
        y1={pad.top + innerH}
        x2={pad.left + innerW}
        y2={pad.top + innerH}
        className="stroke-border"
        strokeWidth="1"
      />
      <line
        x1={pad.left}
        y1={pad.top}
        x2={pad.left + innerW}
        y2={pad.top}
        className="stroke-border/40"
        strokeWidth="1"
        strokeDasharray="3 3"
      />

      <text
        x={pad.left - 4}
        y={pad.top + 4}
        textAnchor="end"
        className="fill-muted-foreground"
        style={{ fontSize: "10px" }}
      >
        {max}
      </text>
      <text
        x={pad.left - 4}
        y={pad.top + innerH}
        textAnchor="end"
        className="fill-muted-foreground"
        style={{ fontSize: "10px" }}
      >
        0
      </text>

      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {ticks.map((t, i) => (
        <text
          key={i}
          x={t.x}
          y={height - 4}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: "10px" }}
        >
          {formatShort(t.d.date)}
        </text>
      ))}
    </svg>
  );
}

function formatShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("he-IL", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
