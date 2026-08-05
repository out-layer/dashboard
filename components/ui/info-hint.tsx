'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Inline (i) help popover for explaining a term next to a label. Click to
 * toggle; closes on outside click or Escape. For supplementary explanations
 * only — never put information the user MUST read behind it.
 */
export function InfoHint({ text, className }: { text: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label="What is this?"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-strong font-serif text-[10px] font-semibold italic leading-none text-muted-foreground hover:border-accent hover:text-accent-text"
      >
        i
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-50 block w-64 rounded-md border border-border-strong bg-card p-3 text-xs font-normal normal-case tracking-normal text-muted-foreground shadow-2xl">
          {text}
        </span>
      )}
    </span>
  );
}
