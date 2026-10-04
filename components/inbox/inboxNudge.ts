'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * A page that wants the owner signed in to the inbox — one whose policy asks
 * the owner before an action — says so by mounting `useRequestInboxNudge()`.
 * The bell in the header then shows a small hint under itself while there is
 * no session. One click on the bell puts the hint away for `QUIET_MS`.
 */
let requests = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Mount on a page that wants the hint; it goes when the page does. */
export function useRequestInboxNudge(active = true): void {
  useEffect(() => {
    if (!active) return;
    requests += 1;
    emit();
    return () => {
      requests -= 1;
      emit();
    };
  }, [active]);
}

/** Whether some page on screen wants the hint. */
export function useInboxNudgeWanted(): boolean {
  return useSyncExternalStore(subscribe, () => requests > 0, () => false);
}

/** How long one click on the bell keeps the hint away. */
export const QUIET_MS = 10 * 60 * 1000;
const QUIET_KEY = 'outlayer-inbox-hint-quiet-until';

export function hintQuietNow(): boolean {
  try {
    return Number(localStorage.getItem(QUIET_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

export function quietHint(): void {
  try {
    localStorage.setItem(QUIET_KEY, String(Date.now() + QUIET_MS));
  } catch {
    /* storage unavailable: the hint comes back on the next render, which is harmless */
  }
}
