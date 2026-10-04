'use client';

import { InfoHint } from '@/components/ui/info-hint';

/**
 * Above a connector's policy form, while the stored policy is not in it: that
 * a policy exists, and the button that loads it. It sits ABOVE the form
 * because the form is tall — a button under it is below the fold, and an owner
 * who never sees it edits an empty form and overwrites the policy they have.
 *
 * "You already have a policy" is read off the row, not the policy: the chain
 * shows that the row exists and when it changed, while its keys are sealed
 * inside it. A connector page stores the policy with the credential, so a row
 * without one was made elsewhere — and loading it says so ("no policy at all").
 */
export function LoadPolicyBar({
  saved,
  updatedAt,
  reading,
  disabled,
  onLoad,
}: {
  /** The form holds what was saved just now, not what was read back. */
  saved: boolean;
  /** When the row on the contract last changed — the row is all the chain shows: its keys are inside the ciphertext. */
  updatedAt: Date | null;
  reading: boolean;
  disabled: boolean;
  onLoad: () => void;
}) {
  return (
    <div className="flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <button
        type="button"
        onClick={onLoad}
        disabled={disabled}
        className="shrink-0 rounded-lg border border-border-strong px-3 py-1.5 text-sm font-semibold text-foreground hover:border-accent hover:text-accent-text disabled:opacity-50"
      >
        {reading ? 'Waiting for your wallet…' : saved ? 'Load and decrypt what was saved' : 'Load and decrypt your existing policy'}
      </button>
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        {saved ? 'to see what the connector reads back' : `stored encrypted on the contract${updatedAt ? `, changed ${updatedAt.toLocaleDateString()}` : ''}`}
        <InfoHint
          text={
            <>
              <span className="block">
                Your policy is sealed with the credential, and only the keystore enclave can open it. Loading runs the connector, which on chain is
                a transaction: it attaches 0.1 NEAR, keeps the run&apos;s cost — about 0.0013 NEAR — and returns the rest.
              </span>
              <span className="mt-2 block">The answer is sealed to a key this page has just made, so the chain records only ciphertext.</span>
            </>
          }
        />
      </span>
    </div>
  );
}
