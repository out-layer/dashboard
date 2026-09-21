'use client';

import * as React from 'react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * An identifier that copies itself when clicked — and stays on screen while it
 * does. The confirmation takes the place of the HINT, not of the value: text
 * that turns into "copied" and back makes the line jump, and for a moment the
 * thing the reader was looking at is gone.
 *
 * `HashChip` is the boxed, truncating sibling for tables and badges; this one
 * sits inside a sentence or a list row.
 */
export function CopyText({
  value,
  display,
  className,
}: {
  /** What is copied. */
  value: string;
  /** What is shown, when it is not the whole value (a shortened account). */
  display?: React.ReactNode;
  className?: string;
}) {
  // The hint is drawn `fixed`, from the text's own rectangle: these ids live in
  // scrolling lists, and a bubble positioned inside one is cut off by its edge.
  const [hint, setHint] = useState<{ text: string; left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setHint({ text, left: r.left, top: r.top >= 28 ? r.top - 24 : r.bottom + 4 });
  };
  return (
    <>
      <button
        type="button"
        onMouseEnter={(e) => {
          if (!timer.current) show(e.currentTarget, 'Click to copy');
        }}
        onMouseLeave={() => {
          if (!timer.current) setHint(null);
        }}
        onClick={async (e) => {
          const el = e.currentTarget;
          let text = 'Copied';
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            text = 'Could not copy';
          }
          show(el, text);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            setHint(null);
          }, 1200);
        }}
        className={cn('cursor-pointer break-all text-left font-mono hover:underline decoration-dotted underline-offset-2', className)}
      >
        {display ?? value}
      </button>
      {hint && (
        <span
          role="status"
          style={{ left: hint.left, top: hint.top }}
          className="pointer-events-none fixed z-50 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 font-sans text-[10px] font-medium text-background shadow"
        >
          {hint.text}
        </span>
      )}
    </>
  );
}
