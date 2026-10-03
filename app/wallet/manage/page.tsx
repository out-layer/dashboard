'use client';

import { PageHeader } from '@/components/ui/page-header';
import { useState, useEffect, useCallback, Suspense, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { RequireWallet } from '@/components/ui/require-wallet';
import { EmptyState } from '@/components/ui/empty-state';
import { AgentChip } from '@/components/ui/agent-chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { InfoHint } from '@/components/ui/info-hint';
import { implicitAccountOf } from '@/lib/short-account';
import { getCoordinatorApiUrl } from '@/lib/api';
import Link from 'next/link';
import { actionCreators } from '@near-js/transactions';
import { saveWalletKey, getAllWalletKeys, getWalletKey, removeWalletKey } from '@/lib/wallet-keys';

interface WalletPolicy {
  wallet_pubkey: string;
  owner: string;
  frozen: boolean;
  updated_at: number;
}

export default function WalletManagePageWrapper() {
  return (
    <Suspense>
      <WalletManagePage />
    </Suspense>
  );
}

function WalletManagePage() {
  const {
    accountId,
    isConnected,
    network,
    contractId,
    viewMethod,
    signAndSendTransaction,
  } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const searchParams = useSearchParams();

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [wallets, setWallets] = useState<WalletPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // API key wallet (from ?key=wk_... query param)
  const [apiKeyWallet, setApiKeyWallet] = useState<{ wallet_id: string; address: string } | null>(null);

  // Saved API keys from localStorage
  const [savedKeys, setSavedKeys] = useState<Record<string, string>>({});
  const [showKeyInput, setShowKeyInput] = useState<string | null>(null);
  /** The action whose consequences are on screen, waiting for the owner's click. */
  const [confirming, setConfirming] = useState<{ action: 'freeze' | 'unfreeze' | 'remove'; walletPubkey: string } | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // Load saved keys on mount
  useEffect(() => {
    const all = getAllWalletKeys();
    const map: Record<string, string> = {};
    for (const [pk, entry] of Object.entries(all)) {
      map[pk] = entry.apiKey;
    }
    setSavedKeys(map);
  }, []);

  // The wallet's key for this visit: `?key=` as given, or, for `?wallet=<account>`,
  // the key this browser saved for that wallet — so a link can name a wallet
  // without carrying its key.
  const urlKey =
    searchParams.get('key') ||
    (searchParams.get('wallet') ? getWalletKey(`ed25519:${searchParams.get('wallet')}`) : null);

  // Also save key from URL param if we know the wallet pubkey
  useEffect(() => {
    const apiKey = urlKey;
    if (apiKey && apiKeyWallet) {
      const pk = `ed25519:${apiKeyWallet.address}`;
      saveWalletKey(pk, apiKey);
      setSavedKeys((prev) => ({ ...prev, [pk]: apiKey }));
    }
  }, [apiKeyWallet, urlKey]);

  // Resolve API key from query param → wallet_id
  useEffect(() => {
    const apiKey = urlKey;
    if (!apiKey) return;

    (async () => {
      try {
        const resp = await fetch(`${coordinatorUrl}/wallet/v1/address?chain=near`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        if (!resp.ok) {
          setError(`Invalid API key: HTTP ${resp.status}`);
          return;
        }
        const data = await resp.json();
        setApiKeyWallet({ wallet_id: data.wallet_id, address: data.address });
      } catch (err) {
        setError(`Failed to resolve API key: ${(err as Error).message}`);
      }
    })();
  }, [urlKey, coordinatorUrl]);

  // Load wallet policies owned by this account
  const loadWallets = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);

    try {
      const result = await viewMethod({
        contractId,
        method: 'get_wallet_policies_by_owner',
        args: { owner: accountId },
      }).catch(() => []);

      setWallets((result as WalletPolicy[]) || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, contractId, viewMethod]);

  useEffect(() => {
    if (isConnected && accountId) {
      loadWallets();
    }
  }, [isConnected, accountId, loadWallets]);

  const handleFreeze = async (walletPubkey: string) => {
    if (!accountId) return;
    setError(null);
    setSubmitting(true);

    try {
      const action = actionCreators.functionCall(
        'freeze_wallet',
        { wallet_pubkey: walletPubkey },
        BigInt('30000000000000'),
        BigInt('0')
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess(`Wallet ${walletPubkey.substring(0, 20)}... frozen`);
      setTimeout(() => {
        setSuccess(null);
        loadWallets();
      }, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnfreeze = async (walletPubkey: string) => {
    if (!accountId) return;
    setError(null);
    setSubmitting(true);

    try {
      const action = actionCreators.functionCall(
        'unfreeze_wallet',
        { wallet_pubkey: walletPubkey },
        BigInt('30000000000000'),
        BigInt('0')
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess(`Wallet ${walletPubkey.substring(0, 20)}... unfrozen`);
      setTimeout(() => {
        setSuccess(null);
        loadWallets();
      }, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Remove the wallet's policy: one transaction of `delete_wallet_policy`,
   * from the click on the dialog that said what follows.
   */
  const handleRemovePolicy = async (walletPubkey: string) => {
    if (!accountId) return;
    setError(null);
    setSubmitting(true);

    try {
      const action = actionCreators.functionCall(
        'delete_wallet_policy',
        { wallet_pubkey: walletPubkey },
        BigInt('30000000000000'),
        BigInt('0')
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess(`The policy of ${walletPubkey.substring(0, 20)}... is removed`);
      setTimeout(() => {
        setSuccess(null);
        loadWallets();
      }, 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  /** From the dialog's button: the action it described, and the dialog closes. */
  const confirmAction = async () => {
    if (!confirming) return;
    const { action, walletPubkey } = confirming;
    if (action === 'freeze') await handleFreeze(walletPubkey);
    else if (action === 'unfreeze') await handleUnfreeze(walletPubkey);
    else await handleRemovePolicy(walletPubkey);
    setConfirming(null);
  };

  /** Get the API key for a wallet — from saved keys or URL param */
  const getWalletApiKey = (walletPubkey: string): string | null => {
    return savedKeys[walletPubkey] || urlKey || null;
  };

  const formatTimestamp = (nanos: number) => {
    return new Date(nanos / 1_000_000).toLocaleString();
  };

  if (!isConnected) {
    return (
 <div className="w-full">
        <PageHeader title="Wallets" />
        <RequireWallet subject="your wallet policies" />
      </div>
    );
  }

  return (
 <div className="w-full">
      <PageHeader
        title="Wallets"
        description="Policy-guarded agent wallets you control: freeze, unfreeze and edit policies."
        action={
          <Link
            href="/wallet/new"
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            New agent
          </Link>
        }
      />

      {error && (
 <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
 <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}

      {success && (
 <div className="mb-4 rounded-md border border-success/30 bg-success/10 p-3">
 <p className="text-sm text-success-text">{success}</p>
        </div>
      )}

      {/* API key wallet (from ?key= param) — new wallet without policy yet */}
      {apiKeyWallet && !wallets.some((w) => w.wallet_pubkey === `ed25519:${apiKeyWallet.address}`) && (
 <div className="mb-4 bg-card rounded-lg border-2 border-dashed border-accent">
 <div className="px-4 py-4 sm:px-6">
 <div className="flex items-center justify-between">
              <div>
 <div className="flex items-center space-x-2">
 <span className="text-sm font-medium">New Wallet</span>
 <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-warning/10 text-warning">
 <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3"><path d="M8 1.5 15 14H1zM7.25 6v4h1.5V6zm0 5v1.5h1.5V11z" /></svg>
                    No Policy
                  </span>
                </div>
 <p className="mt-1 text-xs text-muted-foreground font-mono break-all">
                  ed25519:{apiKeyWallet.address}
                </p>
 <p className="text-xs text-faint-foreground mt-1">
                  NEAR address: <AgentChip account={apiKeyWallet.address} className="font-mono" />
                </p>
              </div>
 <div className="flex items-center gap-3">
                {/* A wallet with no policy is invisible in the list below —
                    that list comes from the on-chain policies. This card is the
                    only place a NEW agent appears, so the subscription has to
                    be reachable from here too, not only once a policy exists.
                    The subscription page asks for the agent's PAYMENT key: a
                    subscription belongs to one, and a `wk_` does not name it. */}
                <Link
                  href="/subscription"
 className="text-sm text-accent-text hover:underline"
                >
                  subscription
                </Link>
                <Link
                  href={
                    searchParams.get('wallet')
                      ? `/wallet?wallet=${encodeURIComponent(searchParams.get('wallet') as string)}`
                      : `/wallet?key=${urlKey}`
                  }
 className="px-3 py-1.5 text-sm bg-accent text-on-accent rounded hover:bg-accent-hover"
                >
                  Set Policy
                </Link>
 </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
 <div className="flex items-center justify-center py-12">
 <svg className="animate-spin h-8 w-8 text-accent-text" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
 <span className="ml-3 text-muted-foreground">Loading wallets...</span>
        </div>
      ) : wallets.length === 0 && !apiKeyWallet ? (
        <EmptyState
          title="No wallet policies yet"
          description="Create an agent here, or let one register itself with your account as controller."
          action={
            <div className="flex items-center gap-4">
              <Link
                href="/wallet/new"
                className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
              >
                New agent
              </Link>
              <Link href="/docs/agent-custody" className="text-sm font-semibold text-accent-text hover:underline">
                How agent custody works →
              </Link>
            </div>
          }
        />
      ) : (
 <div className="max-w-3xl space-y-4">
          {wallets.map((wallet) => {
            const walletKey = getWalletApiKey(wallet.wallet_pubkey);
            return (
            <div
              key={wallet.wallet_pubkey}
 className={`rounded-lg border ${
                wallet.frozen ? 'border-info/40 bg-info/5' : 'border-border bg-card'
              }`}
            >
 <div className="px-4 py-4 sm:px-6">
 <div className="flex items-center justify-between">
                  <div>
 <div className="flex items-center space-x-2">
 <span className="inline-flex items-center px-2 py-0.5 rounded border border-border-strong text-xs font-semibold text-muted-foreground">
                        {wallet.wallet_pubkey.startsWith('ed25519:') ? 'NEAR' : wallet.wallet_pubkey.split(':')[0]}
                      </span>
                      {wallet.frozen ? (
 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-info/10 text-info">
                          FROZEN
                        </span>
                      ) : (
 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-success/10 text-success-text">
                          Active
                        </span>
                      )}
                    </div>
                    {implicitAccountOf(wallet.wallet_pubkey) ? (
                      <p className="mt-1 text-xs text-muted-foreground" title={wallet.wallet_pubkey}>
                        <AgentChip account={implicitAccountOf(wallet.wallet_pubkey) as string} className="font-mono" />
                      </p>
                    ) : (
 <p className="mt-1 text-xs text-muted-foreground font-mono break-all">
                        {wallet.wallet_pubkey.split(':').slice(1).join(':') || wallet.wallet_pubkey}
                      </p>
                    )}
 <p className="text-xs text-faint-foreground mt-1">
                      Updated: {formatTimestamp(wallet.updated_at)}
                    </p>
                  </div>
 <div className="flex items-center space-x-2">
                    {walletKey ? (
                      <Link
                        href={`/wallet?key=${walletKey}`}
 className="px-3 py-1.5 text-sm border border-accent text-accent-text rounded hover:bg-accent/10"
                      >
                        Edit Policy
                      </Link>
                    ) : (
 <span className="px-3 py-1.5 text-sm border border-border-strong text-faint-foreground rounded cursor-not-allowed" title="Save an API key first to edit policy">
                        Edit Policy
                      </span>
                    )}
                    {wallet.frozen ? (
                      <IconAction
                        title="Unfreeze: let the agent act again"
                        onClick={() => setConfirming({ action: 'unfreeze', walletPubkey: wallet.wallet_pubkey })}
                        disabled={submitting}
                      >
                        <UnlockIcon />
                      </IconAction>
                    ) : (
                      <IconAction
                        title="Freeze: the agent starts nothing new"
                        onClick={() => setConfirming({ action: 'freeze', walletPubkey: wallet.wallet_pubkey })}
                        disabled={submitting}
                      >
                        <LockIcon />
                      </IconAction>
                    )}
                    <IconAction
                      title="Remove the policy"
                      onClick={() => setConfirming({ action: 'remove', walletPubkey: wallet.wallet_pubkey })}
                      disabled={submitting}
                      destructive
                    >
                      <TrashIcon />
                    </IconAction>
                  </div>
                </div>

                {wallet.frozen && (
 <p className="mt-2 text-xs text-muted-foreground">
                    Frozen: the agent can start nothing new. Orders it already placed stay open and keep filling &mdash;
                    a freeze does not cancel them. Cancelling is never frozen and the agent&apos;s API key still works for
                    it: have the agent (or do it yourself with that key) call <code className="bg-card-muted px-1 rounded">POST /wallet/v1/limit-orders/cancel-all</code>.
                  </p>
                )}

                {/* API Key (local browser storage) */}
 <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2">
 <span className="text-xs font-semibold text-muted-foreground">API Key</span>
                  <InfoHint
                    text={
                      <>
                        Kept in this browser only, to open Edit Policy. A wallet&apos;s keys are added and rotated there, under
                        Authorized keys &mdash; with one of its keys in hand.
                      </>
                    }
                  />

                  {/* Local saved key */}
                  {savedKeys[wallet.wallet_pubkey] ? (
 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">Local:</span>
 <code className="text-xs font-mono bg-card-muted px-2 py-0.5 rounded select-all">
                        {revealedKeys.has(wallet.wallet_pubkey)
                          ? savedKeys[wallet.wallet_pubkey]
                          : savedKeys[wallet.wallet_pubkey].substring(0, 6) + '...' + savedKeys[wallet.wallet_pubkey].slice(-4)}
                      </code>
                      <button
                        onClick={() => setRevealedKeys((prev) => {
                          const next = new Set(prev);
                          next.has(wallet.wallet_pubkey) ? next.delete(wallet.wallet_pubkey) : next.add(wallet.wallet_pubkey);
                          return next;
                        })}
 className="text-xs text-faint-foreground hover:text-foreground cursor-pointer"
                      >
                        {revealedKeys.has(wallet.wallet_pubkey) ? 'hide' : 'show'}
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(savedKeys[wallet.wallet_pubkey]); setSuccess('API key copied'); setTimeout(() => setSuccess(null), 2000); }}
 className="text-xs text-accent-text hover:underline"
                      >
                        copy
                      </button>
                      <button
                        onClick={() => { removeWalletKey(wallet.wallet_pubkey); setSavedKeys((prev) => { const n = { ...prev }; delete n[wallet.wallet_pubkey]; return n; }); }}
 className="text-xs text-destructive-text hover:opacity-80 cursor-pointer"
                      >
                        remove
                      </button>
                      {/* The way in to a subscription for this agent. It
                          belongs to one of the agent's PAYMENT keys, which the
                          page asks for — the saved `wk_` does not name one. */}
                      <Link
                        href="/subscription"
 className="text-xs text-accent-text hover:underline"
                      >
                        subscription
                      </Link>
                    </div>
                  ) : showKeyInput === wallet.wallet_pubkey ? (
 <div className="flex flex-1 items-center gap-2">
                      <input
                        type="text"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && keyInput.trim()) {
                            saveWalletKey(wallet.wallet_pubkey, keyInput.trim());
                            setSavedKeys((prev) => ({ ...prev, [wallet.wallet_pubkey]: keyInput.trim() }));
                            setKeyInput('');
                            setShowKeyInput(null);
                          }
                        }}
                        placeholder="wk_..."
 className="flex-1 px-2 py-1 border border-border-strong bg-background rounded text-xs font-mono outline-none focus:border-accent"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (keyInput.trim()) {
                            saveWalletKey(wallet.wallet_pubkey, keyInput.trim());
                            setSavedKeys((prev) => ({ ...prev, [wallet.wallet_pubkey]: keyInput.trim() }));
                            setKeyInput('');
                            setShowKeyInput(null);
                          }
                        }}
 className="text-xs text-accent-text hover:underline"
                      >
                        save
                      </button>
 <button onClick={() => { setShowKeyInput(null); setKeyInput(''); }} className="text-xs text-faint-foreground hover:text-foreground cursor-pointer">
                        cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowKeyInput(wallet.wallet_pubkey); setKeyInput(''); }}
 className="text-xs text-accent-text hover:underline"
                    >
                      + Save to browser
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={
            confirming.action === 'freeze'
              ? 'Freeze this wallet?'
              : confirming.action === 'unfreeze'
                ? 'Unfreeze this wallet?'
                : 'Remove this wallet\'s policy?'
          }
          action={
            confirming.action === 'freeze'
              ? 'Sign: freeze the wallet'
              : confirming.action === 'unfreeze'
                ? 'Sign: unfreeze the wallet'
                : 'Sign: remove the policy'
          }
          destructive={confirming.action !== 'unfreeze'}
          busy={submitting}
          onConfirm={() => void confirmAction()}
          onClose={() => setConfirming(null)}
        >
          <p className="break-all font-mono text-xs">{confirming.walletPubkey}</p>
          {confirming.action === 'freeze' && (
            <ul className="list-disc space-y-1 pl-5">
              <li>The agent can start nothing new with this wallet: no transfer, swap, withdrawal or call.</li>
              <li>Orders it already placed stay open and keep filling: a freeze cancels nothing.</li>
              <li>Cancelling is never frozen: the agent&apos;s API key still cancels its orders.</li>
              <li>Unfreeze lets it act again, within its policy.</li>
            </ul>
          )}
          {confirming.action === 'unfreeze' && (
            <ul className="list-disc space-y-1 pl-5">
              <li>The agent can act with this wallet again, within its policy as it is.</li>
            </ul>
          )}
          {confirming.action === 'remove' && (
            <ul className="list-disc space-y-1 pl-5">
              <li>The wallet keeps working, with no policy: no limits, no allowlists, no approvals.</li>
              <li>
                The API keys this policy authorized stop working, and the key the wallet was registered with works again
                &mdash; whoever holds that key controls the wallet with no limits.
              </li>
              <li>A freeze, if any, is lifted.</li>
              <li>Approvals waiting on this wallet are no longer listed in your inbox.</li>
              <li>The storage deposit of the policy is refunded to you.</li>
              <li>Limiting the wallet again takes a new policy, set with its API key.</li>
            </ul>
          )}
          <p>One transaction, signed by your wallet, with nothing attached.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** A small button that is an icon, named by its title on hover and for a screen reader. */
function IconAction({
  title,
  onClick,
  disabled,
  destructive = false,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded border border-border-strong text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 ${
        destructive ? 'hover:text-destructive-text' : 'hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

const UnlockIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);
