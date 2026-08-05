'use client';

import { useState } from 'react';
import { actionCreators } from '@near-js/transactions';
import { Button } from '@/components/ui/button';

interface NearTopUpModalProps {
  accountId: string;
  nonce: number;
  contractId: string;
 signAndSendTransaction: (params: unknown) => Promise<unknown>;
  onComplete: () => void;
  onCancel: () => void;
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
  signAndSendTransaction,
  onComplete,
  onCancel,
}: NearTopUpModalProps) {
  const [nearAmount, setNearAmount] = useState<string>('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // Swap contract that will execute the intent
      const swapContractId = 'v1.publishintent.near';

      const action = actionCreators.functionCall(
        'top_up_payment_key_with_near',
        { nonce, swap_contract_id: swapContractId },
        BigInt('200000000000000'), // 200 TGas (needs more for cross-contract calls)
        BigInt(yoctoNear)
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      onComplete();
    } catch (err) {
      console.error('Failed to top up with NEAR:', err);
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

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
