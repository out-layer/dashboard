'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * A dialog that says what an action will do before the wallet is opened for
 * it. The action runs from the click on its button inside the dialog, and
 * from nothing else; Cancel, Escape and a click outside close it.
 */
export function ConfirmDialog({
  title,
  children,
  action,
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  /** The button's words: what is signed. */
  action: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancel}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-border-strong px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50 ${destructive ? 'bg-destructive' : 'bg-accent'}`}
          >
            {busy ? 'Waiting for the wallet…' : action}
          </button>
        </div>
      </div>
    </div>
  );
}
