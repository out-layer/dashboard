'use client';

import * as React from 'react';
import { useEffect, useState } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Single wallet gate for the whole app. Replaces the divergent copy-pasted
 * "connect wallet" blocks. Renders children when connected, otherwise a
 * unified empty state opening the shared WalletConnectionModal (network
 * choice included), and honors the reopen-after-network-switch flow.
 */
export interface RequireWalletProps {
  /** What the user unlocks by connecting, e.g. "your projects". */
  subject?: string;
  children?: React.ReactNode;
}

export function RequireWallet({ subject = 'this page', children }: RequireWalletProps) {
  const { isConnected, shouldReopenModal, clearReopenModal } = useNearWallet();
  const [modalOpen, setModalOpen] = useState(false);

  // After a network switch the app reloads and asks to reopen the wallet modal.
  useEffect(() => {
    if (shouldReopenModal && !isConnected) {
      setModalOpen(true);
      clearReopenModal();
    }
  }, [shouldReopenModal, isConnected, clearReopenModal]);

  if (isConnected) return <>{children}</>;

  return (
    <>
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8" aria-hidden="true">
            <rect x="3" y="6.5" width="18" height="13" rx="2.5" />
            <path d="M16 12.5h5M6.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h9" />
          </svg>
        }
        title="Connect your NEAR wallet"
        description={`Sign in with a NEAR wallet to access ${subject}.`}
        action={<Button onClick={() => setModalOpen(true)}>Connect Wallet</Button>}
      />
      <WalletConnectionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
