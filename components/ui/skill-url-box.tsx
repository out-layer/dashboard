'use client';

import { useState } from 'react';

/** Read-only URL field + Copy button — the standard way to hand out a skill link. */
export function SkillUrlBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex max-w-xl gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Skill URL"
        className="min-w-0 flex-1 rounded-md border border-border-strong px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
        className="inline-flex shrink-0 items-center rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
