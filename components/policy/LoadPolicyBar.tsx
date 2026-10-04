'use client';

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
    <div className="max-w-3xl space-y-2 rounded-md border border-border bg-card-muted p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1">
          {saved ? (
            <>Saved just now. Load it to see what the connector reads back.</>
          ) : (
            <>
              <span className="font-medium">You already have a policy.</span> It is stored encrypted on the contract
              {updatedAt ? `, last changed ${updatedAt.toLocaleDateString()}` : ''}. The form below stays empty until you load it.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onLoad}
          disabled={disabled}
          className="shrink-0 rounded-lg border border-border-strong px-4 py-2 text-sm font-semibold text-foreground hover:border-accent hover:text-accent-text disabled:opacity-50"
        >
          {reading ? 'Waiting for your wallet…' : 'Load and decrypt it'}
        </button>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="select-none hover:text-foreground">Why does loading it need a transaction?</summary>
        <div className="mt-2 space-y-2">
          <p>
            Your policy is stored sealed, together with the credential, and only the keystore enclave can open it — this page cannot read it
            back. The one door into the enclave is running the connector, and on chain a run is a transaction: it attaches 0.1 NEAR, keeps the
            run&apos;s cost — about 0.0013 NEAR — and returns the rest.
          </p>
          <p>The connector answers with the policy sealed to a key this page has just created and never sends anywhere, so the chain records only ciphertext.</p>
        </div>
      </details>
    </div>
  );
}
