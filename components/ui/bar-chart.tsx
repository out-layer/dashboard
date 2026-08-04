'use client';

import * as React from 'react';

/**
 * Minimal single-series bar chart (pure SVG, theme-token driven).
 * One series → no legend; the card title names it. Bars use the theme's
 * chart color; grid is hairline; axis figures are tabular.
 */
export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  height?: number;
  /** Show roughly this many x labels (first/last always shown). */
  xTicks?: number;
}

export function BarChart({ data, height = 160, xTicks = 5 }: BarChartProps) {
  const W = 640;
  const H = height;
  const PADL = 36;
  const PADR = 8;
  const PADT = 8;
  const PADB = 20;

  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const step = innerW / data.length;
  const barW = Math.max(2, Math.min(18, step - 2));

  const y = (v: number) => PADT + innerH * (1 - v / max);
  const labelEvery = Math.max(1, Math.round(data.length / xTicks));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      role="img"
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={PADL}
            y1={y(max * f)}
            x2={W - PADR}
            y2={y(max * f)}
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={PADL - 6}
            y={y(max * f) + 3.5}
            textAnchor="end"
            fontSize="10"
            fill="var(--faint-foreground)"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(max * f)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = PADL + step * i + (step - barW) / 2;
        const barH = Math.max(d.value > 0 ? 2 : 0, innerH * (d.value / max));
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={PADT + innerH - barH}
              width={barW}
              height={barH}
              rx="2"
              fill="var(--chart)"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {(i === 0 || i === data.length - 1 || i % labelEvery === 0) && (
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="9"
                fill="var(--faint-foreground)"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
