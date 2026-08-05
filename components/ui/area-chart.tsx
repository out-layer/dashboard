'use client';

import * as React from 'react';
import { useId, useRef, useState } from 'react';

/**
 * Single-series area chart (accent-colored), pure SVG: hairline grid, y labels,
 * sparse x labels, gradient fill, crosshair + dot + tooltip on hover, endpoint
 * dot. One series only by design — for comparisons render small multiples.
 */
export interface AreaChartPoint {
  date: string;
  value: number;
}

export interface AreaChartProps {
  data: AreaChartPoint[];
  /** Tooltip unit, e.g. "transactions". */
  unit?: string;
  /** 'area' (line + gradient fill) or 'bar' (per-day columns). */
  kind?: 'area' | 'bar';
  /** Dot on every data point — for cumulative curves. */
  showPoints?: boolean;
  height?: number;
  className?: string;
}

const W = 640;
const PADL = 44;
const PADR = 14;
const PADT = 12;
const PADB = 24;

function niceMax(v: number): number {
  if (v <= 10) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function fmtAxis(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function AreaChart({ data, unit = '', kind = 'area', showPoints = false, height = 215, className }: AreaChartProps) {
  const gradId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div className={className}>
        <p className="py-8 text-sm text-muted-foreground">Not enough data yet.</p>
      </div>
    );
  }

  const H = height;
  const ymax = niceMax(Math.max(...data.map((p) => p.value), 1));
  const px = (i: number) => PADL + ((W - PADL - PADR) * i) / (data.length - 1);
  const py = (v: number) => PADT + (H - PADT - PADB) * (1 - v / ymax);
  const line = data.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(p.value).toFixed(1)}`).join(' ');

  const xTicks = [0, Math.round((data.length - 1) / 4), Math.round((data.length - 1) / 2), Math.round(((data.length - 1) * 3) / 4), data.length - 1];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const xFrac = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((xFrac - PADL) / (W - PADL - PADR)) * (data.length - 1))));
    setHover(i);
  };

  const last = data[data.length - 1];
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={unit ? `${unit} per day` : 'Daily values'}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--chart)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--chart)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((g) => {
          const v = (ymax * g) / 3;
          const y = py(v);
          return (
            <g key={g}>
              <line x1={PADL} y1={y} x2={W - PADR} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text
                x={PADL - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="var(--faint-foreground)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtAxis(v)}
              </text>
            </g>
          );
        })}
        {xTicks.map((i, k) => (
          <text
            key={k}
            x={px(i)}
            y={H - 7}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            fontSize="10"
            fill="var(--faint-foreground)"
          >
            {fmtDate(data[i].date)}
          </text>
        ))}
        {kind === 'area' ? (
          <>
            <path d={`${line} L${px(data.length - 1)} ${py(0)} L${px(0)} ${py(0)} Z`} fill={`url(#${gradId})`} />
            <path d={line} fill="none" stroke="var(--chart)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {showPoints &&
              data.map((p, i) => (
                <circle key={i} cx={px(i)} cy={py(p.value)} r="2" fill="var(--chart)" />
              ))}
          </>
        ) : (
          data.map((p, i) => {
            const bw = Math.max(4, ((W - PADL - PADR) / data.length) * 0.7);
            const x = px(i) - bw / 2;
            const y = py(p.value);
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={bw}
                height={Math.max(0, py(0) - y)}
                rx="2"
                fill="var(--chart)"
                opacity={hover === i ? 1 : 0.8}
              />
            );
          })
        )}
        {hover !== null && kind === 'area' && (
          <>
            <line
              x1={px(hover)}
              x2={px(hover)}
              y1={PADT}
              y2={H - PADB}
              stroke="var(--border-strong)"
              strokeWidth="1"
            />
            <circle cx={px(hover)} cy={py(data[hover].value)} r="3.2" fill="var(--chart)" stroke="var(--card)" strokeWidth="2" />
          </>
        )}
        {kind === 'area' && (
          <circle cx={px(data.length - 1)} cy={py(last.value)} r="3.4" fill="var(--chart)" stroke="var(--card)" strokeWidth="2" />
        )}
      </svg>
      {hovered && wrapRef.current && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border-strong bg-card px-2.5 py-1.5 text-xs shadow-2xl"
          style={{
            left: Math.min(
              (px(hover!) / W) * wrapRef.current.clientWidth + 12,
              wrapRef.current.clientWidth - 150,
            ),
            top: Math.max(0, (py(hovered.value) / H) * height - 38),
          }}
        >
          <span className="text-faint-foreground">{fmtDate(hovered.date)}</span> ·{' '}
          <b className="tabular-nums">{hovered.value.toLocaleString('en-US')}</b>
          {unit ? ` ${unit}` : ''}
        </div>
      )}
    </div>
  );
}
