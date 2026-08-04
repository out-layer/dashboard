'use client';

import { useState } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { actionCreators } from '@near-js/transactions';
import { Button } from '@/components/ui/button';

interface DepositUsdcModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful deposit (balance refresh). */
  onSuccess?: () => void;
}

export default function DepositUsdcModal({ open, onClose, onSuccess }: DepositUsdcModalProps) {
  const { contractId, signAndSendTransaction, stablecoin } = useNearWallet();
  const [amount, setAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setDepositing(true);
    setError(null);

    try {
      // Convert USD to minimal units (6 decimals)
      const amountMinimal = BigInt(Math.floor(parseFloat(amount) * 10 ** stablecoin.decimals));

      // ft_transfer_call to stablecoin contract with msg = "deposit_balance"
      const action = actionCreators.functionCall(
        'ft_transfer_call',
        {
          receiver_id: contractId,
          amount: amountMinimal.toString(),
          msg: JSON.stringify({ action: 'deposit_balance' }),
        },
        BigInt('100000000000000'), // 100 TGas
        BigInt('1'), // 1 yoctoNEAR required
      );

      await signAndSendTransaction({
        receiverId: stablecoin.contract,
        actions: [action],
      });

      setAmount('');
      onClose();
      // Reload data after a short delay — the RPC needs a beat to reflect it.
      setTimeout(() => onSuccess?.(), 2000);
    } catch (err) {
      setError((err as Error).message || 'Deposit failed');
    } finally {
      setDepositing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
          <h3 className="mb-3 text-lg font-semibold">Deposit {stablecoin.symbol}</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Deposit {stablecoin.symbol} to use as attached_usd when calling projects. This balance
            pays project developers.
          </p>
          <label className="mb-1 block text-sm font-medium">Amount ({stablecoin.symbol})</label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-muted-foreground">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10.00"
              className="block w-full rounded-md border border-border-strong bg-background py-2 pl-7 pr-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
          </div>
          <p className="mt-1 text-xs text-faint-foreground">Token: {stablecoin.contract}</p>
          {error && (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2">
              <p className="text-xs text-destructive-text">{error}</p>
            </div>
          )}
          <div className="mt-5 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleDeposit} disabled={depositing || !amount}>
              {depositing ? 'Depositing…' : 'Deposit'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
