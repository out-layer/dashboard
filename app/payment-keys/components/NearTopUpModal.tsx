'use client';

import { useState } from 'react';
import { actionCreators } from '@near-js/transactions';

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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-foreground mb-4">
          Top Up with NEAR - Key #{nonce}
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
            className="w-full border border-border-strong rounded-lg px-3 py-2 text-foreground placeholder:text-faint-foreground focus:ring-2 focus:ring-accent"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Minimum 0.035 NEAR (includes 0.025 NEAR fee). Exact amounts may change — see current values at <a href="/stats" className="text-[var(--primary-orange)] underline">Stats</a>.
          </p>
        </div>

        <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
          <p className="text-sm text-warning">
            Your NEAR will be swapped to USDC automatically via NEAR Intents.
            A 2% slippage tolerance is applied.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-card-muted hover:bg-card-muted text-foreground px-4 py-2 rounded-lg font-medium transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleTopUp}
            disabled={isSubmitting}
            className="flex-1 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Processing...' : 'Top Up with NEAR'}
          </button>
        </div>
      </div>
    </div>
  );
}
