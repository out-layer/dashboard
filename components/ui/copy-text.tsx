'use client';

import * as React from 'react';
import { useState } from 'react';
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
  const [copied, setCopied] = useState(false);
  return (
    <span className="relative inline-block max-w-full align-baseline">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            /* clipboard unavailable */
          }
        }}
        // While the bubble says "Copied", the native hint would say the opposite.
        title={copied ? undefined : 'Click to copy'}
        className={cn('cursor-pointer break-all text-left font-mono hover:underline decoration-dotted underline-offset-2', className)}
      >
        {display ?? value}
      </button>
      {copied && (
        <span
          role="status"
          className="pointer-events-none absolute -top-6 left-0 z-10 rounded bg-foreground px-1.5 py-0.5 font-sans text-[10px] font-medium text-background shadow"
        >
          Copied
        </span>
      )}
    </span>
  );
}
