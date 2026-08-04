'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { RequireWallet } from '@/components/ui/require-wallet';
import { EmptyState } from '@/components/ui/empty-state';
import { CodeBlock } from '@/components/ui/code-block';
import { HashChip } from '@/components/ui/hash-chip';
import { getCoordinatorApiUrl } from '@/lib/api';
import Link from 'next/link';
import { findKeyForWallets, saveWalletKey } from '@/lib/wallet-keys';

interface PendingApproval {
  id: string;
  wallet_id: string;
  request_type: string;
  request_data: Record<string, unknown>;
  required_approvals: number;
  approved_count: number;
  request_hash: string;
  expires_at: string;
  created_at: string;
  // display helpers
  wallet_pubkey?: string;
}

/**
 * Auto-refresh interval (ms). Drives the visible countdown only —
 * the actual coordinator fetch is run by a single leader elected
 * via `navigator.locks` in `app/layout.tsx::PendingApprovalsBadge`.
 * This page subscribes to that leader's broadcasts and resets its
 * countdown whenever an update arrives. Keep this in sync with the
 * layout's `POLL_INTERVAL_MS`.
 */
const REFRESH_INTERVAL = 60_000;

export default function WalletApprovalsPage() {
  return (
 <Suspense fallback={<div className="w-full py-8 text-faint-foreground">Loading...</div>}>
      <WalletApprovalsContent />
    </Suspense>
  );
}

function WalletApprovalsContent() {
  const { accountId, isConnected, network, contractId, viewMethod, signMessage } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const searchParams = useSearchParams();
  const router = useRouter();
  // Stable ref for viewMethod to avoid re-triggering useEffect on every render
  const viewMethodRef = useRef(viewMethod);
  viewMethodRef.current = viewMethod;

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [hasPolicies, setHasPolicies] = useState(false);
  const [nextRefreshIn, setNextRefreshIn] = useState<number | null>(null);
  // Cached wallet pubkeys (loaded once from contract, reused for polling)
  const walletPubkeysRef = useRef<string[]>([]);
  // BroadcastChannel shared by all open tabs of this page: the leader tab
  // (elected via Web Locks API) publishes fresh fetch results here so the
  // followers update their UI without each hitting the coordinator.
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  // API key for approve action
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);

  // Read API key from URL params on mount
  useEffect(() => {
    const keyFromUrl = searchParams.get('key');
    if (keyFromUrl) {
      setApiKey(keyFromUrl);
    }
  }, [searchParams]);

  // Try to load API key from localStorage when approvals load
  useEffect(() => {
    if (!apiKey && approvals.length > 0) {
      const walletPubkeys = approvals
        .map((a) => a.wallet_pubkey)
        .filter((pk): pk is string => !!pk);
      const savedKey = findKeyForWallets(walletPubkeys);
      if (savedKey) {
        setApiKey(savedKey);
      }
    }
  }, [approvals, apiKey]);

  // Fetch pending approvals for cached wallet pubkeys (coordinator only, no RPC).
  // Always broadcasts fresh results so other tabs of this page can update
  // their UI without re-fetching.
  const fetchPendingApprovals = useCallback(async (pubkeys: string[]) => {
    const allApprovals: PendingApproval[] = [];
    for (const pubkey of pubkeys) {
      try {
        const resp = await fetch(
          `${coordinatorUrl}/wallet/v1/pending_approvals_by_pubkey?near_pubkey=${encodeURIComponent(pubkey)}`
        );
        if (!resp.ok) continue;
        const data = await resp.json();
        if (data.pending_approvals) {
          for (const pa of data.pending_approvals) {
            allApprovals.push({ ...pa, wallet_pubkey: pubkey });
          }
        }
      } catch {
        // skip individual wallet errors
      }
    }
    setApprovals(allApprovals);
    broadcastRef.current?.postMessage({ type: 'approvals-update', approvals: allApprovals });
  }, [coordinatorUrl]);

  // Initial load: get wallet pubkeys from contract (once), then fetch approvals
  const loadApprovals = useCallback(async () => {
    if (!accountId || !contractId) return;
    setLoading(true);
    setError(null);

    try {
      const wallets = await viewMethodRef.current({
        contractId,
        method: 'get_wallet_policies_by_owner',
        args: { owner: accountId },
 }).catch(() => []) as Array<{ wallet_pubkey: string }>;

      const pubkeys = wallets.map(w => w.wallet_pubkey);
      walletPubkeysRef.current = pubkeys;
      setHasPolicies(pubkeys.length > 0);

      if (pubkeys.length === 0) {
        setApprovals([]);
        return;
      }

      await fetchPendingApprovals(pubkeys);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, contractId, fetchPendingApprovals]);

  // Initial load when connected
  useEffect(() => {
    if (isConnected && accountId) {
      loadApprovals();
    }
  }, [isConnected, accountId, loadApprovals]);

  // Auto-refresh — passive listener.
  //
  // The single global poller lives in the layout badge
  // (PendingApprovalsBadge), elected across all tabs and all pages
  // via navigator.locks. This page just subscribes to the broadcast
  // channel and updates its UI when the leader publishes a fresh
  // fetch. The 1-second tick drives the visible "next refresh in X"
  // countdown; it resets whenever a broadcast lands.
  //
  // On mount we still trigger one synchronous fetch (via
  // fetchPendingApprovals → /pending_approvals_by_pubkey) so the
  // page shows data immediately rather than waiting up to a minute
  // for the next leader tick. fetchPendingApprovals also broadcasts
  // its result, so any open badge / other tab gets the update too.
  useEffect(() => {
    if (!hasPolicies || !isConnected) {
      setNextRefreshIn(null);
      return;
    }

    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel('outlayer-approvals-results')
        : null;
    broadcastRef.current = channel;

    let countdown = REFRESH_INTERVAL / 1000;
    setNextRefreshIn(countdown);

    const tick = setInterval(() => {
      countdown = Math.max(0, countdown - 1);
      setNextRefreshIn(countdown);
    }, 1000);

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === 'approvals-update' && Array.isArray(event.data.approvals)) {
          setApprovals(event.data.approvals as PendingApproval[]);
          countdown = REFRESH_INTERVAL / 1000;
          setNextRefreshIn(countdown);
        }
      };
    }

    return () => {
      clearInterval(tick);
      channel?.close();
      broadcastRef.current = null;
    };
  }, [hasPolicies, isConnected]);

  // Approve a pending request (requires NEAR wallet signature, not API key)
  const handleApprove = async (approvalId: string) => {
    const approval = approvals.find((a) => a.id === approvalId);
    if (!approval) return;

    setApprovingId(approvalId);
    setError(null);
    setSuccess(null);

    try {
      // Generate 32-byte random nonce
      const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
      const nonceBase64 = Buffer.from(nonceBytes).toString('base64');

      // Build message: "approve:{approval_id}:{wallet_pubkey}:{request_hash}" — wallet_pubkey
      // binds the vote to THIS wallet (no cross-wallet replay). Must match the keystore.
      if (!approval.wallet_pubkey) {
        throw new Error('Missing wallet_pubkey for this approval — open the approval detail to approve.');
      }
      const message = `approve:${approvalId}:${approval.wallet_pubkey}:${approval.request_hash}`;

      // Sign with NEAR wallet (NEP-413)
      const signed = await signMessage({
        message,
        recipient: contractId,
        nonce: nonceBase64,
      });

      if (!signed) {
        throw new Error('Signature cancelled');
      }

      // Send signature to coordinator (no Bearer token needed)
      const resp = await fetch(`${coordinatorUrl}/wallet/v1/approve/${approvalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: signed.signature,
          public_key: signed.publicKey,
          account_id: signed.accountId,
          nonce: nonceBase64,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || err.message || `API error: ${resp.status}`);
      }
      const data = await resp.json();
      if (data.request_id) {
        // Threshold met — redirect to audit page
        const auditUrl = apiKey ? `/wallet/audit?key=${encodeURIComponent(apiKey)}` : '/wallet/audit';
        router.push(auditUrl);
        return;
      } else {
        setSuccess(`Approved (${data.approved}/${data.required}). Waiting for more approvals.`);
      }

      // Reload
      await loadApprovals();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovingId(null);
    }
  };

  // Reject a pending request
  const handleReject = async (approvalId: string) => {
    if (!apiKey) {
      setPendingApprovalId(approvalId);
      setShowApiKeyPrompt(true);
      return;
    }

    if (!confirm('Reject this request? This cannot be undone.')) return;

    setApprovingId(approvalId);
    setError(null);
    setSuccess(null);

    try {
      const resp = await fetch(`${coordinatorUrl}/wallet/v1/reject/${approvalId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ approver_account: accountId }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || err.message || `API error: ${resp.status}`);
      }
      setSuccess('Request rejected.');
      await loadApprovals();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApprovingId(null);
    }
  };

  const handleApiKeySubmit = () => {
    setShowApiKeyPrompt(false);
    if (pendingApprovalId && apiKey) {
      // Save key to localStorage for the wallet
      const approval = approvals.find((a) => a.id === pendingApprovalId);
      if (approval?.wallet_pubkey) {
        saveWalletKey(approval.wallet_pubkey, apiKey);
      }
      handleReject(pendingApprovalId);
    }
    setPendingApprovalId(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  // Not connected — show connect prompt
  if (!isConnected) {
    return (
 <div className="w-full">
 <h1 className="text-xl font-bold tracking-tight mb-6">Approvals</h1>
        <RequireWallet subject="pending approvals for your AI wallets" />
      </div>
    );
  }

  return (
 <div className="w-full">
 <div className="flex items-center justify-between mb-6">
 <h1 className="text-xl font-bold tracking-tight">
          Approvals
          {approvals.length > 0 && (
 <span className="ml-2 inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-bold text-white bg-destructive">
              {approvals.length}
            </span>
          )}
        </h1>
 <div className="flex items-center space-x-3">
 <span className="text-xs text-faint-foreground font-mono">
            {accountId}
          </span>
          {nextRefreshIn !== null && (
 <span className="text-xs text-faint-foreground tabular-nums">
              {nextRefreshIn}s
            </span>
          )}
          <button
            onClick={() => loadApprovals()}
 className="text-sm text-accent-text hover:text-accent-text font-medium"
          >
            Refresh
          </button>
          <Link
            href="/wallet/manage"
 className="text-sm text-accent-text hover:text-accent-text font-medium"
          >
            Manage
          </Link>
          <Link
            href="/wallet/audit"
 className="text-sm text-accent-text hover:text-accent-text font-medium"
          >
            Audit
          </Link>
        </div>
      </div>

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

      {/* API key prompt dialog */}
      {showApiKeyPrompt && (
 <div className="mb-4 rounded-md border border-info/30 bg-info/10 p-4">
 <p className="text-sm text-info mb-2">
            Enter the wallet API key to reject this request.
            It will be saved in this browser for future use.
          </p>
 <div className="flex gap-3">
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApiKeySubmit()}
              placeholder="wk_..."
 className="flex-1 px-4 py-2 border border-border-strong bg-background rounded-lg outline-none focus:border-accent focus:ring-1 focus:ring-accent font-mono text-sm"
              autoFocus
            />
            <button
              onClick={handleApiKeySubmit}
              disabled={!apiKey.trim()}
 className="px-4 py-2 bg-accent text-on-accent rounded-lg text-sm font-semibold disabled:opacity-50 cursor-pointer"
            >
              Submit
            </button>
            <button
              onClick={() => { setShowApiKeyPrompt(false); setPendingApprovalId(null); }}
 className="px-4 py-2 text-muted-foreground hover:text-foreground text-sm cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
 <div className="flex items-center justify-center py-12">
 <svg className="animate-spin h-8 w-8 text-accent-text" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
 <span className="ml-3 text-muted-foreground">Loading approvals...</span>
        </div>
      ) : !hasPolicies ? (
        <EmptyState
          title="No wallet policies found"
          description="Set up policies for your AI wallets first — approvals appear for wallets you control."
          action={
 <Link href="/wallet/manage" className="text-sm font-semibold text-accent-text hover:underline">
              Open Wallets →
            </Link>
          }
        />
      ) : approvals.length === 0 ? (
        <EmptyState
          title="No pending approvals"
          description="Approvals appear here when a wallet operation crosses a policy threshold and needs your multisig confirmation."
        />
      ) : (
 <div className="space-y-4">
          {approvals.map((approval) => (
            <div
              key={approval.id}
 className={`rounded-lg border bg-card ${
                isExpired(approval.expires_at)
                  ? 'border-border opacity-60'
                  : 'border-accent/50'
              }`}
            >
 <div className="px-4 py-4 sm:px-6">
 <div className="flex items-center justify-between">
                  <div>
 <div className="flex items-center space-x-2">
 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/10 text-accent-text">
                        {approval.request_type}
                      </span>
                      {isExpired(approval.expires_at) && (
 <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border border-border-strong text-muted-foreground">
                          Expired
                        </span>
                      )}
                    </div>
                    {approval.wallet_pubkey && (
 <div className="mt-1.5 flex items-center gap-1.5 text-xs text-faint-foreground">
                        Wallet: <HashChip value={approval.wallet_pubkey} trim={10} />
                      </div>
                    )}
                  </div>
 <div className="text-right">
 <p className="text-sm text-muted-foreground tabular-nums">
                      {approval.approved_count} / {approval.required_approvals} approved
                    </p>
 <p className="text-xs text-faint-foreground mt-1">
                      Expires: {formatDate(approval.expires_at)}
                    </p>
                  </div>
                </div>

                {/* Canonical operation — exactly what your approval signs off on */}
 <div className="mt-3">
                  <CodeBlock
                    code={JSON.stringify(approval.request_data, null, 2)}
                    language="json"
                    filename={`${approval.request_type} — requested operation`}
                  />
 <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-faint-foreground">
                    Signed hash: <HashChip value={approval.request_hash} trim={10} />
 <span>— your NEP-413 approval signs this exact hash; it commits to the operation above.</span>
                  </div>
                </div>

                {/* Action buttons */}
                {!isExpired(approval.expires_at) && (
 <div className="mt-4 flex items-center justify-between">
 <p className="text-xs text-faint-foreground">
                      Created: {formatDate(approval.created_at)}
                    </p>
 <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleReject(approval.id)}
                        disabled={approvingId === approval.id}
 className="px-4 py-2 border border-destructive/40 text-destructive-text text-sm rounded-lg font-semibold hover:bg-destructive/10 disabled:opacity-50 cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(approval.id)}
                        disabled={approvingId === approval.id}
 className="px-4 py-2 bg-accent text-on-accent text-sm rounded-lg font-semibold hover:bg-accent-hover disabled:opacity-50 cursor-pointer"
                      >
                        {approvingId === approval.id ? 'Processing...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
