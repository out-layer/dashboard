'use client';

import { useState, useEffect, useCallback } from 'react';
import { actionCreators } from '@near-js/transactions';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { RequireWallet } from '@/components/ui/require-wallet';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getCoordinatorApiUrl } from '@/lib/api';
import { PaymentKeyData, PaymentKeyBalance, CreationState } from './components/types';
import { CreateKeyForm } from './components/CreateKeyForm';
import { PaymentKeyCard } from './components/PaymentKeyCard';
import { TopUpModal } from './components/TopUpModal';
import { NearTopUpModal } from './components/NearTopUpModal';

interface UserSecret {
 accessor: { System?: { PaymentKey?: Record<string, never> } } | Record<string, unknown>;
  profile: string;
  created_at: number;
  updated_at: number;
  storage_deposit: string;
  access: unknown;
}

export default function PaymentKeysPage() {
  const {
    accountId,
    isConnected,
    signAndSendTransaction,
    contractId,
    viewMethod,
    network,
    stablecoin,
  } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  // Payment keys list
  const [paymentKeys, setPaymentKeys] = useState<PaymentKeyData[]>([]);
  const [balances, setBalances] = useState<Map<number, PaymentKeyBalance>>(new Map());
  const [loading, setLoading] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Creation flow
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creationState, setCreationState] = useState<CreationState>({ step: 'form' });

  // TopUp modal
  const [topUpKey, setTopUpKey] = useState<PaymentKeyData | null>(null);
  const [nearTopUpKey, setNearTopUpKey] = useState<PaymentKeyData | null>(null);

  // Load payment keys from contract
  const loadPaymentKeys = useCallback(async () => {
    if (!accountId) return;

    setLoading(true);
    try {
      const secrets = await viewMethod({
        contractId,
        method: 'list_user_secrets',
        args: { account_id: accountId },
      }) as UserSecret[];

      // Filter to only Payment Keys (System accessor)
      // Contract returns { System: 'PaymentKey' } - System is a string, not object
      const paymentKeySecrets = (secrets || []).filter(
        (s) => {
          if (!s.accessor || typeof s.accessor !== 'object') return false;
          if (!('System' in s.accessor)) return false;
          const system = (s.accessor as { System: unknown }).System;
          // System is a unit variant string 'PaymentKey', not an object
          return system === 'PaymentKey';
        }
      );

      // Convert to PaymentKeyData
      const keys: PaymentKeyData[] = paymentKeySecrets.map((s) => ({
        nonce: parseInt(s.profile, 10),
        created_at: s.created_at,
        updated_at: s.updated_at,
        storage_deposit: s.storage_deposit,
        project_ids: [], // Not available without decryption
        max_per_call: '0',
        initial_balance: '0',
      }));

      // Sort by nonce
      keys.sort((a, b) => a.nonce - b.nonce);
      setPaymentKeys(keys);

      // Load balances from coordinator
      await loadBalances(keys);
    } catch (err) {
      console.error('Failed to load payment keys:', err);
      setError(`Failed to load payment keys: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [accountId, contractId, viewMethod]);

  // Load balances from coordinator
  const loadBalances = useCallback(async (keys: PaymentKeyData[]) => {
    if (!accountId || keys.length === 0) return;

    const newBalances = new Map<number, PaymentKeyBalance>();

    for (const key of keys) {
      try {
        const response = await fetch(
          `${coordinatorUrl}/public/payment-keys/${accountId}/${key.nonce}/balance`
        );
        if (response.ok) {
          const balance = await response.json();
          newBalances.set(key.nonce, balance);
        }
      } catch (err) {
        console.warn(`Failed to load balance for nonce ${key.nonce}:`, err);
      }
    }

    setBalances(newBalances);
  }, [accountId, coordinatorUrl]);

  // Load payment keys when connected
  useEffect(() => {
    if (isConnected && accountId) {
      loadPaymentKeys();
    }
  }, [isConnected, accountId, loadPaymentKeys]);

  // State for pending TopUp after first transaction
  const [pendingTopUp, setPendingTopUp] = useState<{
    nonce: number;
    depositAmount: string;
    generatedKey: string;
  } | null>(null);

  // Restore Payment Key creation state after wallet redirect
  // Wallet-selector redirects with ?transactionHashes=xxx after successful tx
  useEffect(() => {
    if (!accountId) return;

    const storageKey = `payment_key_creation_${accountId}`;
    const savedState = localStorage.getItem(storageKey);

    if (!savedState) return;

    try {
      const { key, nonce, step, depositAmount, timestamp } = JSON.parse(savedState);
      // Only restore if saved within the last 10 minutes
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (timestamp <= tenMinutesAgo || !key || typeof nonce !== 'number') {
        localStorage.removeItem(storageKey);
        return;
      }

      // Check URL for transaction result (wallet-selector adds ?transactionHashes=xxx on success)
      const urlParams = new URLSearchParams(window.location.search);
      const transactionHashes = urlParams.get('transactionHashes');
      const errorCode = urlParams.get('errorCode');

      // Clean URL params after reading
      if (transactionHashes || errorCode) {
        window.history.replaceState({}, '', window.location.pathname);
      }

      // Handle transaction error
      if (errorCode) {
        localStorage.removeItem(storageKey);
        setError('Transaction was rejected or failed.');
        return;
      }

      // No transaction result yet - don't restore (user might be in the middle of approval)
      if (!transactionHashes) {
        return;
      }

      // Transaction succeeded - check which step we were on
      if (step === 'store_secrets') {
        // First transaction done, need to do TopUp
        // Show key and set up pending TopUp
        setCreationState({ step: 'complete', generatedKey: key, nonce });
        setPendingTopUp({ nonce, depositAmount: depositAmount || '2', generatedKey: key });
        setSuccess('Key stored! Click "Continue TopUp" to add initial balance.');
        // Don't remove localStorage yet - we'll need it if user refreshes before TopUp

      } else if (step === 'topup') {
        // Second transaction done - all complete!
        setCreationState({ step: 'complete', generatedKey: key, nonce });
        setSuccess('Payment Key created with initial balance! Copy the key now.');
        localStorage.removeItem(storageKey);
        // Reload keys to show the new one
        loadPaymentKeys();

      } else {
        // Unknown step, just show the key
        setCreationState({ step: 'complete', generatedKey: key, nonce });
        localStorage.removeItem(storageKey);
      }

    } catch {
      localStorage.removeItem(storageKey);
    }
  }, [accountId, loadPaymentKeys]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Get next available nonce (starting from 1, not 0)
  const getNextNonce = useCallback((): number => {
    if (paymentKeys.length === 0) return 1;
    const maxNonce = Math.max(...paymentKeys.map((k) => k.nonce));
    return maxNonce + 1;
  }, [paymentKeys]);

  // Handle creation complete (first transaction done, TopUp still needed)
  const handleCreationComplete = useCallback((generatedKey: string, nonce: number) => {
    setCreationState({ step: 'complete', generatedKey, nonce });
    setShowCreateForm(false);
    loadPaymentKeys();

    // Check if we need to do TopUp (read deposit amount from localStorage)
    const storageKey = `payment_key_creation_${accountId}`;
    const savedState = localStorage.getItem(storageKey);
    let depositAmount = '2'; // default
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        depositAmount = parsed.depositAmount || '2';
      } catch {
        // ignore
      }
    }

    // Set up pending TopUp for the second transaction
    // User will need to click "Continue: Add Balance" button
    setPendingTopUp({ nonce, depositAmount, generatedKey });
    setSuccess('Key created! Now click "Continue: Add Balance" to top up.');
  }, [loadPaymentKeys, accountId]);

  // Handle creation error
  const handleCreationError = useCallback((error: string) => {
    setCreationState({ step: 'error', error });
    setError(error);
  }, []);

  // Handle TopUp complete
  const handleTopUpComplete = useCallback(() => {
    setTopUpKey(null);
    setPendingTopUp(null);
    loadPaymentKeys();
    setSuccess('Balance topped up successfully!');
  }, [loadPaymentKeys]);

  // Handle NEAR TopUp complete
  const handleNearTopUpComplete = useCallback(() => {
    setNearTopUpKey(null);
    loadPaymentKeys();
    setSuccess('NEAR deposit submitted! Balance will update after swap completes.');
  }, [loadPaymentKeys]);

  // Handle continuing TopUp after first transaction (store_secrets) completed
  const handleContinueTopUp = useCallback(async () => {
    if (!pendingTopUp || !accountId) return;

    const { nonce, depositAmount, generatedKey } = pendingTopUp;
    const storageKey = `payment_key_creation_${accountId}`;

    try {
      // Update localStorage step to 'topup' before transaction
      localStorage.setItem(storageKey, JSON.stringify({
        key: generatedKey,
        nonce,
        step: 'topup',
        depositAmount,
        timestamp: Date.now(),
      }));

      const depositAmountMinimal = (parseFloat(depositAmount) * Math.pow(10, stablecoin.decimals)).toString();

      const ftTransferArgs = {
        receiver_id: contractId,
        amount: depositAmountMinimal,
        msg: JSON.stringify({
          action: 'top_up_payment_key',
          nonce: nonce,
        }),
      };

      const ftAction = actionCreators.functionCall(
        'ft_transfer_call',
        ftTransferArgs,
        BigInt('100000000000000'), // 100 TGas
        BigInt('1') // 1 yoctoNEAR
      );

      const callbackUrl = window.location.href.split('?')[0];

      await signAndSendTransaction({
        receiverId: stablecoin.contract,
        actions: [ftAction],
        callbackUrl,
      });

      // If we get here (non-redirect wallet), transaction succeeded
      localStorage.removeItem(storageKey);
      setPendingTopUp(null);
      setSuccess('Payment Key created with initial balance! Copy the key now.');
      loadPaymentKeys();

    } catch (err) {
      console.error('Failed to top up:', err);
      setError(`Failed to add balance: ${(err as Error).message}`);
    }
  }, [pendingTopUp, accountId, stablecoin, contractId, signAndSendTransaction, loadPaymentKeys]);

  // Handle delete key
  const handleDeleteKey = useCallback(async (key: PaymentKeyData) => {
    try {
      // Use delete_payment_key with yield/resume:
      // 1. Contract emits DeletePaymentKey event
      // 2. Worker receives event, deletes from coordinator PostgreSQL
      // 3. Worker resumes on contract
      // 4. Contract callback deletes the secret
      const action = actionCreators.functionCall(
        'delete_payment_key',
        {
          nonce: key.nonce,
        },
        BigInt('100000000000000'), // 100 TGas (needs gas for yield/resume)
        BigInt('1') // 1 yoctoNEAR required for security
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess('Payment Key deleted. Storage deposit refunded.');
      loadPaymentKeys();
    } catch (err) {
      console.error('Failed to delete key:', err);
      setError(`Failed to delete: ${(err as Error).message}`);
    }
  }, [contractId, signAndSendTransaction, loadPaymentKeys]);

  return (
    <div className="w-full">
      <PageHeader
        title="Payment keys"
        description="Prepaid API keys for HTTPS calls to OutLayer projects."
        action={
          isConnected ? (
            <Button
              onClick={() => {
                setShowCreateForm(true);
                setCreationState({ step: 'form' });
              }}
            >
              New key
            </Button>
          ) : undefined
        }
      />

      {/* Feedback banners */}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success-text">
          {success}
        </div>
      )}

      {/* Generated key — shown once, right after creation */}
      {creationState.step === 'complete' && creationState.generatedKey && (
        <div className="mb-6 max-w-3xl rounded-md border border-warning/40 bg-warning/10 p-4">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4 shrink-0 text-warning"
              aria-hidden="true"
            >
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            Your payment key — copy it now
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            This key will NOT be shown again. Store it securely.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-card p-3 font-mono text-sm text-foreground">
              {accountId}:{creationState.nonce}:{creationState.generatedKey}
            </code>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${accountId}:${creationState.nonce}:${creationState.generatedKey}`
                );
                setSuccess('Copied to clipboard!');
              }}
            >
              Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-faint-foreground">
            Format: owner:nonce:key — use it in the <code>X-Payment-Key</code> header.
          </p>

          {/* Continue TopUp button - shown when first transaction completed but TopUp pending */}
          {pendingTopUp && pendingTopUp.nonce === creationState.nonce && (
            <div className="mt-4 border-t border-warning/40 pt-4">
              <p className="mb-2 text-sm text-foreground">
                Step 2: add the initial balance of ${pendingTopUp.depositAmount}{' '}
                {stablecoin.symbol}.
              </p>
              <Button onClick={handleContinueTopUp}>Continue: add balance</Button>
            </div>
          )}
        </div>
      )}

      {!isConnected && (
        <div className="mb-6">
          <RequireWallet subject="your payment keys" />
        </div>
      )}

      {/* Create form modal */}
      {showCreateForm && (
        <CreateKeyForm
          accountId={accountId!}
          contractId={contractId}
          stablecoin={stablecoin}
          nextNonce={getNextNonce()}
          coordinatorUrl={coordinatorUrl}
          signAndSendTransaction={signAndSendTransaction}
          onComplete={handleCreationComplete}
          onError={handleCreationError}
          onCancel={() => setShowCreateForm(false)}
          creationState={creationState}
          setCreationState={setCreationState}
        />
      )}

      {/* TopUp modal */}
      {topUpKey && (
        <TopUpModal
          accountId={accountId!}
          nonce={topUpKey.nonce}
          contractId={contractId}
          stablecoin={stablecoin}
          signAndSendTransaction={signAndSendTransaction}
          onComplete={handleTopUpComplete}
          onCancel={() => setTopUpKey(null)}
        />
      )}

      {/* NEAR TopUp modal (mainnet only) */}
      {nearTopUpKey && (
        <NearTopUpModal
          accountId={accountId!}
          nonce={nearTopUpKey.nonce}
          contractId={contractId}
          signAndSendTransaction={signAndSendTransaction}
          onComplete={handleNearTopUpComplete}
          onCancel={() => setNearTopUpKey(null)}
        />
      )}

      {/* Payment keys list */}
      {isConnected && (
        <div className="mb-6">
          {loading ? (
            <div className="flex items-center gap-3 py-8">
              <span
                className="h-8 w-8 shrink-0 animate-spin rounded-full border-b-2 border-accent"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">Loading payment keys…</span>
            </div>
          ) : paymentKeys.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  className="h-8 w-8"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              }
              title="No payment keys"
              description="Create a prepaid key to call OutLayer projects over HTTPS — no NEAR transactions per call."
              action={
                <Button
                  onClick={() => {
                    setShowCreateForm(true);
                    setCreationState({ step: 'form' });
                  }}
                >
                  Create key
                </Button>
              }
            />
          ) : (
            <div className="max-w-3xl space-y-4">
              {paymentKeys.map((key) => (
                <PaymentKeyCard
                  key={key.nonce}
                  paymentKey={key}
                  balance={balances.get(key.nonce)}
                  stablecoin={stablecoin}
                  onTopUp={() => setTopUpKey(key)}
                  onTopUpNear={network === 'mainnet' ? () => setNearTopUpKey(key) : undefined}
                  onDelete={() => handleDeleteKey(key)}
                  coordinatorUrl={coordinatorUrl}
                  accountId={accountId!}
                  network={network}
                />
              ))}
            </div>
          )}

          {/* Refresh Button */}
          {paymentKeys.length > 0 && (
            <div className="mt-4">
              <Button variant="ghost" size="sm" onClick={loadPaymentKeys}>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Informational plate — one per page, last */}
      <div className="max-w-3xl rounded-lg border border-border bg-card-muted p-4">
        <h2 className="text-sm font-semibold">About payment keys</h2>
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">HTTPS API access</strong>: call OutLayer projects
            without NEAR transactions
          </li>
          <li>
            <strong className="text-foreground">Prepaid balance</strong>: top up with{' '}
            {stablecoin.symbol}, pay per compute
          </li>
          <li>
            <strong className="text-foreground">Project restrictions</strong>: optionally limit a
            key to specific projects
          </li>
          <li>
            <strong className="text-foreground">Secure storage</strong>: keys are stored encrypted
            on-chain
          </li>
        </ul>
        <div className="mt-3 rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs font-semibold text-foreground">Header format</div>
          <code className="mt-1 block font-mono text-xs text-accent-text">
            X-Payment-Key: {accountId || 'yourname.near'}:1:your-secret-key
          </code>
        </div>
      </div>
    </div>
  );
}
