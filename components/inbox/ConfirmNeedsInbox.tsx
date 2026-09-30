'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useInbox } from '@/contexts/InboxContext';

/**
 * Beside a policy that asks the owner before an operation. A task an agent
 * leaves is encrypted for the browsers signed in to the inbox when it is
 * made, so a browser signed in now reads them as they arrive; one signed in
 * later makes the ones that came first readable with one transaction. Drawn
 * only while this browser holds no session; the wallet opens from the button's
 * click and from nothing else.
 */
export function ConfirmNeedsInbox() {
  const { session, signIn, signingIn, error } = useInbox();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || session === 'active') return null;
  return (
    <div className="space-y-3 rounded-md border border-info/30 bg-info/10 p-4 text-sm text-foreground">
      <p>Sign in to your inbox now, so an agent&apos;s tasks reach this browser readable at once.</p>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{error}</p>
      )}
      <Button size="sm" onClick={() => void signIn()} disabled={signingIn}>
        {signingIn ? 'Waiting for the wallet…' : 'Sign in with your wallet'}
      </Button>
      <p className="text-muted-foreground">
        Without it nothing is lost: a task that arrives first is made readable with one transaction later, and the
        ones after it arrive readable.
      </p>
    </div>
  );
}
