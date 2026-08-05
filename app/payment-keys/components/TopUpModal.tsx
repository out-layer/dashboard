'use client';

import { useState } from 'react';
import { actionCreators } from '@near-js/transactions';
import { Button } from '@/components/ui/button';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-card p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold tracking-tight text-foreground">
          Top up payment key #{nonce}
        </h2>

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
 className="w-full rounded-md border border-border-strong px-3 py-2 text-sm outline-none placeholder:text-faint-foreground focus:border-accent focus:ring-1 focus:ring-accent"
            disabled={isSubmitting}
          />
 <p className="text-xs text-muted-foreground mt-1">
            Minimum $0.01
          </p>
        </div>

        {/* Info */}
        <div className="mb-4 rounded-md border border-border bg-card-muted p-3">
          <p className="text-sm text-muted-foreground">
            This will transfer {amount} {stablecoin.symbol} from your wallet to top up the payment key balance.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleTopUp} disabled={isSubmitting}>
            {isSubmitting ? 'Processing…' : 'Top up'}
          </Button>
        </div>
      </div>
    </div>
  );
}
