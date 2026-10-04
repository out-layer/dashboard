'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether this tab is the one being looked at. A page that reads on a timer
 * reads only while it is: a hidden tab asks nothing, and every open tab of the
 * dashboard shares the same per-address request budget with the visible one.
 * Rendered on the server, a page counts as visible.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    (changed) => {
      document.addEventListener('visibilitychange', changed);
      return () => document.removeEventListener('visibilitychange', changed);
    },
    () => document.visibilityState === 'visible',
    () => true,
  );
}
