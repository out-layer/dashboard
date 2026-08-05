'use client';

import { useState } from 'react';
import { StablecoinConfig } from '@/contexts/NearWalletContext';
import { PaymentKeyData, PaymentKeyBalance, PaymentKeyUsage, formatUsd } from './types';
import { fetchAttestation, AttestationResponse } from '@/lib/api';
import AttestationView from '@/components/AttestationView';
import type { NetworkType } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HashChip } from '@/components/ui/hash-chip';

interface PaymentKeyCardProps {
  paymentKey: PaymentKeyData;
  balance?: PaymentKeyBalance;
  stablecoin: StablecoinConfig;
  onTopUp: () => void;
  onTopUpNear?: () => void; // Only available on mainnet
  onDelete: () => void;
  coordinatorUrl: string;
  accountId: string;
  network: NetworkType;
}

export function PaymentKeyCard({
  paymentKey,
  balance,
  stablecoin,
  onTopUp,
  onTopUpNear,
  onDelete,
  coordinatorUrl,
  accountId,
  network,
}: PaymentKeyCardProps) {
  const [showUsage, setShowUsage] = useState(false);
  const [usage, setUsage] = useState<PaymentKeyUsage[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [usageOffset, setUsageOffset] = useState(0);
  const [usageTotal, setUsageTotal] = useState(0);
  const usageLimit = 20;
  const [attestationModal, setAttestationModal] = useState<{
    jobId: number;
    attestation: AttestationResponse | null;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const loadUsage = async (offset: number = 0) => {
    if (loadingUsage) return;

    setLoadingUsage(true);
    try {
      const response = await fetch(
        `${coordinatorUrl}/public/payment-keys/${accountId}/${paymentKey.nonce}/usage?offset=${offset}&limit=${usageLimit}`
      );
      if (response.ok) {
        const data = await response.json();
        setUsage(data.usage || []);
        setUsageTotal(data.total || 0);
        setUsageOffset(offset);
      }
    } catch (err) {
      console.error('Failed to load usage:', err);
    } finally {
      setLoadingUsage(false);
    }
  };

  const loadAttestation = async (jobId: number | null) => {
    if (!jobId) {
      return; // No job_id available
    }

    setAttestationModal({ jobId, attestation: null, loading: true, error: null });

    try {
      const data = await fetchAttestation(jobId);

      if (!data) {
        setAttestationModal({
          jobId,
          attestation: null,
          loading: false,
          error: 'No attestation found for this job'
        });
        return;
      }

      setAttestationModal({ jobId, attestation: data, loading: false, error: null });
    } catch (err) {
      console.error('Failed to load attestation:', err);
      setAttestationModal({
        jobId,
        attestation: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load attestation'
      });
    }
  };

  const toggleUsage = () => {
    if (!showUsage && usage.length === 0) {
      loadUsage(0);
    }
    setShowUsage(!showUsage);
  };

  const handlePrevPage = () => {
    const newOffset = Math.max(0, usageOffset - usageLimit);
    loadUsage(newOffset);
  };

  const handleNextPage = () => {
    const newOffset = usageOffset + usageLimit;
    if (newOffset < usageTotal) {
      loadUsage(newOffset);
    }
  };

  const formatDate = (timestamp: number | string) => {
    const date = typeof timestamp === 'number'
      ? new Date(timestamp / 1_000_000) // nanoseconds to ms
      : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Calculate available balance
  const initialBalance = balance?.initial_balance || '0';
  const spent = balance?.spent || '0';
  const reserved = balance?.reserved || '0';
  const available = balance?.available || '0';

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Key #{paymentKey.nonce}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Created {formatDate(paymentKey.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onTopUp} title="Top up with USDC">
              Top up
            </Button>
            {onTopUpNear && (
              <Button
                variant="outline"
                size="sm"
                onClick={onTopUpNear}
                title="Top up with NEAR (swapped to USDC)"
              >
                + NEAR
              </Button>
            )}
            <button
              onClick={onDelete}
              className="inline-flex h-8 items-center rounded-md border border-destructive/40 px-2.5 text-xs font-semibold text-destructive-text hover:bg-destructive/10"
              title="Delete Payment Key. WARNING: Remaining balance will be lost! Refunds are not yet implemented."
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Balance section */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-md border border-border bg-card-muted p-3">
            <p className="text-xs text-muted-foreground">Initial balance</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
              {formatUsd(initialBalance, stablecoin.decimals)}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card-muted p-3">
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
              -{formatUsd(spent, stablecoin.decimals)}
            </p>
          </div>
          <div className="rounded-md border border-border bg-card-muted p-3">
            <p className="text-xs text-muted-foreground">Reserved</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
              {formatUsd(reserved, stablecoin.decimals)}
            </p>
          </div>
          <div className="rounded-md border border-border-strong bg-card-muted p-3">
            <p className="text-xs text-muted-foreground">Available</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
              {formatUsd(available, stablecoin.decimals)}
            </p>
          </div>
        </div>

        {/* Last used */}
        {balance?.last_used_at && (
          <p className="mt-3 text-xs text-muted-foreground">
            Last used: {new Date(balance.last_used_at).toLocaleString()}
          </p>
        )}

        {/* Usage toggle */}
        <button
          onClick={toggleUsage}
          className="mt-3 text-sm font-medium text-accent-text hover:underline"
        >
          {showUsage ? 'Hide' : 'Show'} usage history
        </button>
      </div>

      {/* Usage table */}
      {showUsage && (
        <div className="border-t border-border bg-card-muted px-4 py-4 sm:px-5">
          {loadingUsage ? (
            <div className="flex items-center gap-2 py-4">
              <span
                className="h-4 w-4 shrink-0 animate-spin rounded-full border-b-2 border-accent"
                aria-hidden="true"
              />
              <span className="text-sm text-muted-foreground">Loading usage…</span>
            </div>
          ) : usage.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No usage history yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">
                    <th className="pb-2 font-semibold">Date</th>
                    <th className="pb-2 font-semibold">Project</th>
                    <th className="pb-2 text-right font-semibold">Compute</th>
                    <th className="pb-2 text-right font-semibold">Deposit</th>
                    <th className="pb-2 pl-4 font-semibold">Status</th>
                    <th className="pb-2 pl-4 font-semibold">TEE</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.id} className="border-b border-border hover:bg-card/60">
                      <td className="py-2 pr-3 text-foreground">
                        {new Date(u.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3">
                        <HashChip value={u.project_id} trim={0} />
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatUsd(u.compute_cost, stablecoin.decimals)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatUsd(u.attached_deposit, stablecoin.decimals)}
                      </td>
                      <td className="py-2 pl-4">
                        {u.status === 'completed' ? (
                          <Badge variant="success">completed</Badge>
                        ) : u.status === 'failed' ? (
                          <Badge variant="destructive">failed</Badge>
                        ) : (
                          <Badge variant="outline">{u.status}</Badge>
                        )}
                      </td>
                      <td className="py-2 pl-4">
                        {u.job_id ? (
                          <button
                            onClick={() => loadAttestation(u.job_id)}
                            className="text-xs font-medium text-accent-text hover:underline"
                            title={`View TEE attestation for job #${u.job_id}`}
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-xs text-faint-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination controls */}
              {usageTotal > usageLimit && (
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Showing {usageOffset + 1}-{Math.min(usageOffset + usageLimit, usageTotal)} of {usageTotal}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={usageOffset === 0 || loadingUsage}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={usageOffset + usageLimit >= usageTotal || loadingUsage}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Attestation Modal */}
      {attestationModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAttestationModal(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border-strong bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
 <div className="p-6">
 <div className="flex justify-between items-center mb-4">
 <div className="flex items-center gap-3">
 <h2 className="text-lg font-bold tracking-tight">
                    TEE Attestation - HTTPS Call
                  </h2>
                  <Badge variant="outline">HTTPS</Badge>
                </div>
                <button
                  onClick={() => setAttestationModal(null)}
 className="text-faint-foreground hover:text-foreground"
                >
 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

 <p className="text-sm text-muted-foreground mb-4 font-mono">
                Job ID: #{attestationModal.jobId}
              </p>

              {attestationModal.loading && (
 <div className="flex justify-center items-center py-12">
 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
                </div>
              )}

              {attestationModal.error && (
 <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4 mb-4">
 <p className="text-destructive-text">{attestationModal.error}</p>
                </div>
              )}

              {attestationModal.attestation && (
                <AttestationView
                  attestation={attestationModal.attestation}
                  network={network}
                  showHelp={false}
                  onToggleHelp={() => {}}
                  isModal={true}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
