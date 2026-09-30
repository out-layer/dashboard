'use client';

import { Button } from '@/components/ui/button';
import { useInbox } from '@/contexts/InboxContext';

/**
 * What stands where the inbox would be while there is no session: what the
 * signature is, and the one button that asks the wallet for it. The wallet
 * opens from this click and from nothing else.
 */
export function SignInPrompt({ compact = false }: { compact?: boolean }) {
  const { session, signIn, signingIn, error } = useInbox();
  return (
    <div className={compact ? 'space-y-3' : 'max-w-3xl space-y-3 rounded-lg border border-border bg-card p-5'}>
      <p className="text-sm font-medium text-foreground">
        {session === 'replaced'
          ? 'This browser was signed out'
          : session === 'ended'
            ? 'Sign again to stay signed in'
            : 'Sign a message to see what your agents ask of you'}
      </p>
      {session === 'replaced' && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <span className="font-semibold">Signed out here. </span>
          Your account is signed in to the inbox in as many browsers as it may be, and this one, signed in longest
          ago, was signed out to make room. Sign in to go on here. If you did not sign in in the others, withdraw
          them in the inbox&apos;s settings, and remove from your account, in your wallet, any access key you do not
          recognise.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        One signature, no transaction and no cost. It opens a session in this browser for 30 days and names a key
        this browser made for it: what your agents ask is encrypted to that key, and only this browser reads it. Your
        other browsers stay signed in. The signature moves nothing and approves nothing.
      </p>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{error}</p>
      )}
      <Button onClick={() => void signIn()} disabled={signingIn} size={compact ? 'sm' : 'default'}>
        {signingIn ? 'Waiting for the wallet…' : 'Sign in with your wallet'}
      </Button>
    </div>
  );
}
