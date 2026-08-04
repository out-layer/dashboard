'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useNearWallet } from '@/contexts/NearWalletContext';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { Button } from '@/components/ui/button';

export default function AccountChip() {
  const { accountId, isConnected } = useNearWallet();
  const [modalOpen, setModalOpen] = useState(false);

  if (isConnected && accountId) {
    const shown = accountId.length > 22 ? `${accountId.slice(0, 10)}…${accountId.slice(-8)}` : accountId;
    return (
      <Link
        href="/settings"
        title={accountId}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 font-mono text-xs text-foreground transition-colors hover:border-border-strong"
      >
        <span className="h-4 w-4 shrink-0 rounded bg-gradient-to-br from-accent to-accent-hover" aria-hidden="true" />
        {shown}
      </Link>
    );
  }

  return (
    <>
      <Button size="sm" className="h-9" onClick={() => setModalOpen(true)}>
        Connect
      </Button>
      <WalletConnectionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
