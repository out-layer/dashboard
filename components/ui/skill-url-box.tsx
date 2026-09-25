'use client';

import { useState } from 'react';

/**
 * Read-only URL field + Copy — the standard way to hand out a skill link.
 * `compact` is the one-line form for a card: a label, the URL truncated in a
 * small field, and a copy glyph; the full form has room for the whole URL and
 * a labelled button.
 */
export function SkillUrlBox({ url, compact = false, label = 'Skill URL' }: { url: string; compact?: boolean; label?: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      // No clipboard (an insecure context, a denied permission): say so; the
      // field is still selectable by hand.
      setCopied('failed');
    }
    setTimeout(() => setCopied(null), 1500);
  };
  const said = copied === 'failed' ? 'Could not copy the URL' : copied ? 'Copied' : '';
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="sr-only" aria-live="polite">{said}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{label}:</span>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={label}
          title={url}
          className="h-7 min-w-0 flex-1 truncate rounded border border-border px-2 font-mono text-[11px] text-muted-foreground outline-none focus:border-accent focus:text-foreground"
        />
        <button
          type="button"
          onClick={copy}
          aria-label={copied === 'failed' ? 'Could not copy — select the field' : copied ? 'Copied' : 'Copy the skill URL'}
          title={copied === 'failed' ? 'Could not copy — select the field' : copied ? 'Copied' : 'Copy'}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:border-accent hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
            {copied === 'yes' ? (
              <path d="M3 8.5l3 3 7-7" />
            ) : (
              <path d="M5.5 5.5V3.3a.8.8 0 01.8-.8h6.4a.8.8 0 01.8.8v6.4a.8.8 0 01-.8.8h-2.2M3.3 5.5h6.4a.8.8 0 01.8.8v6.4a.8.8 0 01-.8.8H3.3a.8.8 0 01-.8-.8V6.3a.8.8 0 01.8-.8z" />
            )}
          </svg>
        </button>
      </div>
    );
  }
  return (
    <div className="flex max-w-xl gap-2">
      <span className="sr-only" aria-live="polite">{said}</span>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        className="min-w-0 flex-1 rounded-md border border-border-strong px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        onClick={copy}
        className="inline-flex shrink-0 items-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
      >
        {copied === 'failed' ? 'Could not copy' : copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
