'use client';

import { useState } from 'react';
import { isImplicitAccount, shortAccount } from '@/lib/short-account';
import { cn } from '@/lib/utils';

/**
 * An account in a tight place. An agent's custody wallet is an implicit
 * account — 64 hex characters that say nothing to a reader — so it is marked
 * as an agent and shown short, with the whole of it in the tooltip; a named
 * account is shown as it is. With `copy` the chip copies the full id on a
 * click, the way `HashChip` does.
 */
export function AgentChip({ account, copy = true, className }: { account: string; copy?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const shown = (
    <>
      {isImplicitAccount(account) ? '🤖 ' : ''}
      {shortAccount(account)}
    </>
  );
  if (!copy) {
    return (
      <span title={account} className={className}>
        {shown}
      </span>
    );
  }
  return (
    <button
      type="button"
      title={account}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(account);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-card-muted px-2 py-0.5 font-mono text-xs text-foreground transition-colors hover:border-border-strong cursor-pointer',
        className,
      )}
    >
      {/* "copied" is laid over the value, so the chip keeps its width. */}
      <span className="grid min-w-0 text-left">
        <span className={cn('col-start-1 row-start-1 min-w-0', copied && 'invisible')}>{shown}</span>
        {copied && <span className="col-start-1 row-start-1 text-success-text">copied</span>}
      </span>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true">
        <rect x="5" y="5" width="8" height="8" rx="1.5" />
        <path d="M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 4v5A1.5 1.5 0 0 0 4.5 10.5h.5" />
      </svg>
    </button>
  );
}
