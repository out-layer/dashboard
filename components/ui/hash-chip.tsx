'use client';

import * as React from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Monospace chip for hashes, ids, account ids, measurements — truncated with
 * one-click copy of the FULL value. Used anywhere a technical identifier is
 * shown; never render raw truncated ids without a copy affordance.
 */
export interface HashChipProps extends React.HTMLAttributes<HTMLButtonElement> {
  value: string;
  /** Characters kept on each side of the ellipsis. 0 disables truncation. */
  trim?: number;
  /** Override the rendered text (the copy button still copies `value`). */
  display?: string;
  /**
   * Truncate by width instead of by characters: the chip shows as much as its
   * container allows and ends in "…" only when it has to. For table cells,
   * where the room a column gets depends on the viewport.
   */
  fit?: boolean;
}

export function HashChip({ value, trim = 6, display, fit = false, className, ...props }: HashChipProps) {
  const [copied, setCopied] = useState(false);
  const base = display ?? value;
  const shown =
    !fit && trim > 0 && base.length > trim * 2 + 1 ? `${base.slice(0, trim)}…${base.slice(-4)}` : base;

  return (
    <button
      type="button"
      title={value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-card-muted px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground cursor-pointer',
        fit && 'min-w-0 max-w-full',
        className,
      )}
      {...props}
    >
      {/* "copied" is laid over the value rather than swapped in, so the chip
          keeps its width and the row does not jump for the second it shows. */}
      <span className="grid min-w-0 text-left">
        <span className={cn('col-start-1 row-start-1 min-w-0', fit && 'truncate', copied && 'invisible')}>{shown}</span>
        {copied && <span className="col-start-1 row-start-1 text-success-text">copied</span>}
      </span>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true">
        <rect x="5" y="5" width="8" height="8" rx="1.5" />
        <path d="M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 4v5A1.5 1.5 0 0 0 4.5 10.5h.5" />
      </svg>
    </button>
  );
}
