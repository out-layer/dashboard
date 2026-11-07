'use client';

import { useState } from 'react';
import { actionCreators } from '@near-js/transactions';
import { Button } from '@/components/ui/button';
import { extractTxHashFromError, waitForTransactionOutcome } from '@/lib/near-rpc';
import { NEAR_TOPUP_SWAP_ACCOUNT, readCredit, readSwap, txHashOf, usdcWords } from '@/lib/near-topup';

interface NearTopUpModalProps {
  accountId: string;
  nonce: number;
  contractId: string;
  rpcUrl: string;
 signAndSendTransaction: (params: unknown) => Promise<unknown>;
  onComplete: () => void;
  onCancel: () => void;
}

const SUPPORT = 'security@outlayer.ai';

type Result =
  | { state: 'credited'; usdc: string; tx: string }
  | { state: 'not_credited'; usdc: string; tx: string }
  | { state: 'not_swapped'; reason: string; tx: string | null }
  | { state: 'failed'; reason: string; tx: string | null }
  /** Sent, with no final answer read yet. `credit` is set once the swap is known to have gone through. */
  | { state: 'unknown'; tx: string | null; credit: { usdc: string; tx: string } | null };

/** Reads what the credit transaction did. Asks only the RPC, never the wallet. */
async function readCreditTx(usdc: string, tx: string, rpcUrl: string): Promise<Result> {
  const outcome = await waitForTransactionOutcome(tx, NEAR_TOPUP_SWAP_ACCOUNT, rpcUrl);
  const credited = readCredit(outcome, usdc);
  if (credited === null) return { state: 'unknown', tx, credit: { usdc, tx } };
  return { state: credited ? 'credited' : 'not_credited', usdc, tx };
}

/** Reads what the owner's transaction did. Asks only the RPC, never the wallet. */
async function readResult(
  outcome: unknown,
  tx: string | null,
  accountId: string,
  rpcUrl: string,
): Promise<Result> {
  let swap = readSwap(outcome);
  if (swap.state === 'unknown' && tx) {
    swap = readSwap(await waitForTransactionOutcome(tx, accountId, rpcUrl));
  }
  switch (swap.state) {
    case 'swapped':
      return readCreditTx(swap.usdc, swap.creditTx, rpcUrl);
    case 'not_swapped':
    case 'failed':
      return { state: swap.state, reason: swap.reason, tx };
    case 'unknown':
      return { state: 'unknown', tx, credit: null };
  }
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`https://nearblocks.io/txns/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all font-mono text-xs text-accent-text hover:underline"
    >
      {hash}
    </a>
  );
}

function ContactSupport() {
  return (
    <>
      Write to{' '}
      <a href={`mailto:${SUPPORT}`} className="text-accent-text hover:underline">
        {SUPPORT}
      </a>{' '}
      with this transaction.
    </>
  );
}

// Convert NEAR to yoctoNEAR
function parseNearToYocto(near: string): string {
  const parsed = parseFloat(near);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error('Invalid NEAR amount');
  }
  // 1 NEAR = 10^24 yoctoNEAR
  const yocto = BigInt(Math.floor(parsed * 1e6)) * BigInt(1e18);
  return yocto.toString();
}

export function NearTopUpModal({
  accountId,
  nonce,
  contractId,
  rpcUrl,
  signAndSendTransaction,
  onComplete,
  onCancel,
}: NearTopUpModalProps) {
  const [nearAmount, setNearAmount] = useState<string>('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkAgain = async (unknown: Extract<Result, { state: 'unknown' }>) => {
    setIsChecking(true);
    try {
      setResult(
        unknown.credit
          ? await readCreditTx(unknown.credit.usdc, unknown.credit.tx, rpcUrl)
          : await readResult(null, unknown.tx, accountId, rpcUrl),
      );
    } finally {
      setIsChecking(false);
    }
  };

  const handleTopUp = async () => {
    if (isSubmitting) return;

    try {
      setError(null);
      setIsSubmitting(true);

      const amountNum = parseFloat(nearAmount);
      if (isNaN(amountNum) || amountNum < 0.01) {
        throw new Error('Minimum deposit is 0.01 NEAR');
      }

      // Convert NEAR to yoctoNEAR
      const yoctoNear = parseNearToYocto(nearAmount);

      const action = actionCreators.functionCall(
        'top_up_payment_key_with_near',
        { nonce, swap_contract_id: NEAR_TOPUP_SWAP_ACCOUNT },
        BigInt('200000000000000'), // 200 TGas (needs more for cross-contract calls)
        BigInt(yoctoNear)
      );

      const outcome = await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setResult(await readResult(outcome, txHashOf(outcome), accountId, rpcUrl));
    } catch (err) {
      console.error('Failed to top up with NEAR:', err);
      // A hash in the error means the transaction is on chain: sending it again
      // would pay twice, so this is a result to read and not a form to retry.
      const sent = extractTxHashFromError(err);
      if (sent) {
        setResult(await readResult(null, sent, accountId, rpcUrl));
      } else {
        setError((err as Error).message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl border border-border-strong bg-card p-6 shadow-2xl">
          {result.state === 'credited' && (
            <>
              <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">Key #{nonce} topped up</h2>
              <p className="mb-3 text-sm text-foreground">{usdcWords(result.usdc)} USDC was added to the key.</p>
            </>
          )}
          {result.state === 'not_credited' && (
            <>
              <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
                Swapped, but key #{nonce} was not credited
              </h2>
              <p className="mb-3 text-sm text-foreground">
                Your NEAR became {usdcWords(result.usdc)} USDC, and the key refused it. The balance did not change and
                the USDC is not returned to you automatically. <ContactSupport />
              </p>
            </>
          )}
          {result.state === 'not_swapped' && (
            <>
              <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
                Key #{nonce} was not topped up
              </h2>
              <p className="mb-3 text-sm text-foreground">
                The swap failed: {result.reason}. The balance did not change and the NEAR you sent is not returned
                automatically. <ContactSupport />
              </p>
            </>
          )}
          {result.state === 'failed' && (
            <>
              <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">The transaction failed</h2>
              <p className="mb-3 text-sm text-foreground">{result.reason}</p>
            </>
          )}
          {result.state === 'unknown' && (
            <>
              <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">No result yet</h2>
              <p className="mb-3 text-sm text-foreground">
                {result.tx
                  ? 'The transaction was sent and has not finished yet. Do not send another one: check again in a minute.'
                  : 'Your wallet did not return the transaction. Look for it in the wallet’s history before sending another one.'}
              </p>
            </>
          )}

          {result.tx && (
            <div className="mb-4">
              <TxLink hash={result.tx} />
            </div>
          )}

          <div className="flex gap-3">
            {result.state === 'unknown' && result.tx && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => checkAgain(result)}
                disabled={isChecking}
              >
                {isChecking ? 'Checking…' : 'Check again'}
              </Button>
            )}
            <Button className="flex-1" onClick={onComplete} disabled={isChecking}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-card p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
          Top up with NEAR — key #{nonce}
        </h2>

        {error && (
 <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
 <p className="text-destructive-text text-sm">{error}</p>
          </div>
        )}

 <div className="mb-4">
 <label className="block text-sm font-medium text-foreground mb-1">
            Amount (NEAR)
          </label>
          <input
            type="text"
            value={nearAmount}
            onChange={(e) => setNearAmount(e.target.value)}
            placeholder="1.0"
 className="w-full rounded-md border border-border-strong px-3 py-2 text-sm outline-none placeholder:text-faint-foreground focus:border-accent focus:ring-1 focus:ring-accent"
            disabled={isSubmitting}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Minimum 0.035 NEAR (includes 0.025 NEAR fee). Exact amounts may change — see current
            values at{' '}
            <a href="/stats" className="text-accent-text hover:underline">
              Stats
            </a>
            .
          </p>
        </div>

        <div className="mb-4 rounded-md border border-border bg-card-muted p-3">
          <p className="text-sm text-muted-foreground">
            Your NEAR will be swapped to USDC automatically via NEAR Intents. A 2% slippage
            tolerance is applied.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleTopUp} disabled={isSubmitting}>
            {isSubmitting ? 'Processing…' : 'Top up with NEAR'}
          </Button>
        </div>
      </div>
    </div>
  );
}
