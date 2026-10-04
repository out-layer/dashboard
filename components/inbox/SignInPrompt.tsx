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
            : 'Turn on notifications from your agents'}
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
        One signature in your wallet — free, no transaction. It moves nothing and approves nothing.
      </p>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">What it does</summary>
        <p className="mt-1">
          It signs this browser in to your inbox for 30 days. What your agents ask is encrypted to a key this browser
          made, so only this browser reads it; your other browsers stay signed in.
        </p>
      </details>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{error}</p>
      )}
      <Button onClick={() => void signIn()} disabled={signingIn} size={compact ? 'sm' : 'default'}>
        {signingIn ? 'Waiting for the wallet…' : 'Sign in with your wallet'}
      </Button>
    </div>
  );
}
