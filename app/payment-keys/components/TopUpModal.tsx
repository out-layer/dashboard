'use client';

import { useState } from 'react';
import { actionCreators } from '@near-js/transactions';
import { StablecoinConfig } from '@/contexts/NearWalletContext';
import { parseUsdToMinimalUnits } from './types';

interface TopUpModalProps {
  accountId: string;
  nonce: number;
  contractId: string;
  stablecoin: StablecoinConfig;
  signAndSendTransaction: (params: unknown) => Promise<unknown>;
  onComplete: () => void;
  onCancel: () => void;
}

export function TopUpModal({
  accountId,
  nonce,
  contractId,
  stablecoin,
  signAndSendTransaction,
  onComplete,
  onCancel,
}: TopUpModalProps) {
  const [amount, setAmount] = useState<string>('10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTopUp = async () => {
    if (isSubmitting) return;

    try {
      setError(null);
      setIsSubmitting(true);

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum < 0.01) {
        throw new Error('Minimum top-up is $0.01');
      }

      const depositAmount = parseUsdToMinimalUnits(amount, stablecoin.decimals);

      // Build ft_transfer_call args
      const ftTransferArgs = {
        receiver_id: contractId,
        amount: depositAmount,
        msg: JSON.stringify({
          action: 'top_up_payment_key',
          nonce: nonce,
        }),
      };

      const action = actionCreators.functionCall(
        'ft_transfer_call',
        ftTransferArgs,
        BigInt('100000000000000'), // 100 TGas
        BigInt('1') // 1 yoctoNEAR
      );

      // ft_transfer_call to stablecoin contract
      await signAndSendTransaction({
        receiverId: stablecoin.contract,
        actions: [action],
      });

      onComplete();
    } catch (err) {
      console.error('Failed to top up:', err);
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg border border-border-xl p-6 max-w-md w-full">
        <h2 className="text-xl font-bold text-foreground mb-4">Top Up Payment Key #{nonce}</h2>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-destructive-text text-sm">{error}</p>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1">
            Amount ({stablecoin.symbol})
          </label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10.00"
            className="w-full border border-border-strong rounded-lg px-3 py-2 text-foreground placeholder:text-faint-foreground focus:ring-2 focus:ring-accent"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Minimum $0.01
          </p>
        </div>

        {/* Info */}
        <div className="mb-4 p-3 bg-info/10 border border-info/30 rounded-lg">
          <p className="text-sm text-info">
            This will transfer {amount} {stablecoin.symbol} from your wallet to top up the payment key balance.
          </p>
        </div>

        {/* Actions */}
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
            className="flex-1 bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Top Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
