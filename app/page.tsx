'use client';

import { useEffect, useState } from 'react';
import { useNearWallet, CONNECTED_HINT_KEY } from '@/contexts/NearWalletContext';
import ProductHome from '@/components/home/ProductHome';
import Overview from '@/components/home/Overview';

/**
 * `/` is prerendered with the anonymous ProductHome, but a returning user's
 * wallet session takes the connector a moment to restore — long enough that
 * the marketing page used to flash before Overview appeared. The context
 * leaves a synchronous localStorage hint on sign-in, so after hydration we
 * swap the flash for a quiet loader and only fall back to ProductHome once
 * the connector finishes restoring and reports no session (stale hint).
 */
export default function Home() {
  const { isConnected, isWalletReady } = useNearWallet();
  // null until mounted: the first client render must match the prerendered
  // anonymous HTML or hydration breaks.
  const [hinted, setHinted] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setHinted(!!localStorage.getItem(CONNECTED_HINT_KEY));
    } catch {
      setHinted(false);
    }
  }, []);

  // Restore finished with no session — the hint was stale, drop it.
  useEffect(() => {
    if (hinted && isWalletReady && !isConnected) {
      try {
        localStorage.removeItem(CONNECTED_HINT_KEY);
      } catch {
        /* storage unavailable */
      }
      setHinted(false);
    }
  }, [hinted, isWalletReady, isConnected]);

  if (isConnected) return <Overview />;

  if (hinted && !isWalletReady) {
    return (
      <div className="flex min-h-[50vh] items-center gap-3">
        <span
          className="h-8 w-8 shrink-0 animate-spin rounded-full border-b-2 border-accent"
          aria-hidden="true"
        />
        <span className="text-sm text-muted-foreground">Restoring your session…</span>
      </div>
    );
  }

  return <ProductHome />;
}
