'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { useInbox } from '@/contexts/InboxContext';
import { SignInPrompt } from '@/components/inbox/SignInPrompt';
import { hintQuietNow, quietHint, useInboxNudgeWanted } from '@/components/inbox/inboxNudge';

/**
 * The bell. With a session it counts what waits and leads to the inbox.
 * Without one it is crossed out and says nothing of what waits — not a
 * count: it offers the signature. When a session ends, the offer opens by
 * itself once — and says so when this browser was signed out because the
 * account signed in on one too many; the wallet still opens only from the click
 * inside it.
 *
 * A page whose policy asks the owner first (`ConfirmNeedsInbox`) puts a small
 * hint under the crossed-out bell — "turn on notifications from your agents" —
 * in place of a block in the page. A click on the bell puts it away for ten
 * minutes.
 */
export function InboxBell() {
  const { isConnected } = useNearWallet();
  const { session, count } = useInbox();
  const [open, setOpen] = useState(false);
  const offered = useRef(false);
  const nudgeWanted = useInboxNudgeWanted();
  // Read after mount: storage is the browser's.
  const [quiet, setQuiet] = useState(true);
  useEffect(() => setQuiet(hintQuietNow()), [nudgeWanted]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((session === 'ended' || session === 'replaced') && !offered.current) {
      offered.current = true;
      setOpen(true);
    }
    if (session === 'active') {
      offered.current = false;
      setOpen(false);
    }
  }, [session]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const frame =
    'relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground cursor-pointer';
  const bell = (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 2a4 4 0 0 0-4 4c0 3-1.2 4-1.2 4h10.4S12 9 12 6a4 4 0 0 0-4-4zM6.6 13a1.5 1.5 0 0 0 2.8 0" />
    </svg>
  );

  if (!isConnected) return null;

  if (session === 'active') {
    return (
      <Link href="/inbox" aria-label={count > 0 ? `Inbox: ${count} waiting` : 'Inbox'} className={frame}>
        {bell}
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => {
          setOpen((was) => !was);
          if (!quiet) {
            quietHint();
            setQuiet(true);
          }
        }}
        aria-label="Inbox: sign in to see what waits"
        aria-expanded={open}
        className={frame}
      >
        {bell}
        <svg className="absolute h-5 w-5" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M3 3l14 14" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border border-border bg-card p-4 shadow-lg">
          <SignInPrompt compact />
        </div>
      )}
      {!open && nudgeWanted && !quiet && (
        <div
          role="note"
          className="absolute right-0 top-11 z-40 w-56 rounded-lg border border-accent/40 bg-card px-3 py-2 text-xs text-foreground shadow-md"
        >
          <span className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-accent/40 bg-card" aria-hidden="true" />
          <span className="font-medium">Turn on notifications from your agents</span>
          <span className="block text-muted-foreground">Click the bell — one signature, free.</span>
        </div>
      )}
    </div>
  );
}
