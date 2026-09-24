'use client';

import * as React from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface FilterSuggestion {
  value: string;
  /** Small tag after the value ("you", "repo", …). */
  hint?: string;
}

/**
 * A single-value filter: a button that opens a text box with suggestions.
 * The suggestions are shortcuts, not a whitelist — anything typed and
 * confirmed with Enter is applied as is.
 */
export function FilterCombo({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: FilterSuggestion[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [active, setActive] = useState(-1);

  const toggle = () => {
    if (!open) {
      setDraft(value);
      setActive(-1);
    }
    setOpen(!open);
  };

  const q = draft.trim().toLowerCase();
  // An unchanged draft is the current filter, not a search — show every option.
  const matches = (q && draft !== value
    ? suggestions.filter((s) => s.value.toLowerCase().includes(q))
    : suggestions
  ).slice(0, 8);

  const apply = (v: string) => {
    onChange(v.trim());
    setOpen(false);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          'inline-flex items-center rounded-lg border text-sm',
          value
            ? 'border-accent/40 bg-accent/10 text-foreground'
            : 'border-dashed border-border-strong text-muted-foreground hover:text-foreground',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          className="inline-flex max-w-[16rem] items-center gap-1.5 px-2.5 py-1 cursor-pointer"
        >
          {value ? (
            <>
              <span className="text-muted-foreground">{label}:</span>
              <span className="truncate font-mono text-xs">{value}</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">+</span>
              {label}
            </>
          )}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-1.5 py-1 text-muted-foreground hover:text-foreground cursor-pointer"
            title={`Clear ${label.toLowerCase()} filter`}
            aria-label={`Clear ${label.toLowerCase()} filter`}
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-2 shadow-lg">
            <input
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setActive(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, matches.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, -1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  apply(active >= 0 ? matches[active].value : draft);
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              placeholder={placeholder}
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none focus:border-accent"
            />
            {matches.length > 0 && (
              <ul className="mt-1 max-h-64 overflow-y-auto">
                {matches.map((s, i) => (
                  <li key={s.value}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => apply(s.value)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1 text-left cursor-pointer',
                        i === active ? 'bg-card-muted text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{s.value}</span>
                      {s.hint && <span className="shrink-0 text-[10px] uppercase tracking-wide text-faint-foreground">{s.hint}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 flex items-center justify-between px-1 pt-1 text-[11px] text-faint-foreground">
              <span>Enter to apply any value</span>
              {value && (
                <button type="button" onClick={() => apply('')} className="text-accent-text hover:underline cursor-pointer">
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
