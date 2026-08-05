'use client';

import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { RequireWallet } from '@/components/ui/require-wallet';
import { EmptyState } from '@/components/ui/empty-state';
import { useState, useEffect, useCallback } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { actionCreators } from '@near-js/transactions';

// HTTPS earnings balance (from coordinator)
interface HttpsEarningsBalance {
  project_owner: string;
  balance: string;
  total_earned: string;
  updated_at: number | null;
}

// Unified earning record from earnings_history table
interface EarningRecord {
  id: number;
  project_id: string;
  attached_usd: string;
  refund_usd: string;
  amount: string; // Net amount (attached - refund)
  source: 'blockchain' | 'https';
  // Blockchain-specific
  tx_hash?: string;
  caller?: string;
  request_id?: number;
  // HTTPS-specific
  call_id?: string;
  payment_key_owner?: string;
  payment_key_nonce?: number;
  created_at: number;
}

interface EarningsHistoryResponse {
  project_owner: string;
  earnings: EarningRecord[];
  total_count: number;
}

// Format USD from minimal units (6 decimals)
function formatUsd(minimalUnits: string, decimals: number = 6): string {
  const num = BigInt(minimalUnits || '0');
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 6);
  return `$${whole}.${fractionStr}`;
}

export default function EarningsPage() {
  const {
    accountId,
    isConnected,
    network,
    stablecoin,
    contractId,
    viewMethod,
    signAndSendTransaction,
  } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  // Blockchain earnings (from contract)
  const [blockchainBalance, setBlockchainBalance] = useState<string>('0');
  // HTTPS earnings (from coordinator)
  const [httpsBalance, setHttpsBalance] = useState<HttpsEarningsBalance | null>(null);
  // Unified history
  const [history, setHistory] = useState<EarningRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'blockchain' | 'https'>('all');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  // Load blockchain earnings from contract
  const loadBlockchainBalance = useCallback(async () => {
    if (!accountId) return;

    try {
      const balance = await viewMethod({
        contractId,
        method: 'get_developer_earnings',
        args: { account_id: accountId },
      });
      // Contract returns U128 as string
      setBlockchainBalance(typeof balance === 'string' ? balance : (balance as { toString: () => string })?.toString() || '0');
    } catch (err) {
      console.error('Failed to load blockchain earnings:', err);
      setBlockchainBalance('0');
    }
  }, [accountId, contractId, viewMethod]);

  // Load HTTPS earnings from coordinator
  const loadHttpsBalance = useCallback(async () => {
    if (!accountId) return;

    try {
      const response = await fetch(
        `${coordinatorUrl}/public/project-earnings/${accountId}`
      );
      if (response.ok) {
        const data = await response.json();
        setHttpsBalance(data);
      }
    } catch (err) {
      console.error('Failed to load HTTPS earnings balance:', err);
    }
  }, [accountId, coordinatorUrl]);

  // Load unified earnings history
  const loadHistory = useCallback(async () => {
    if (!accountId) return;

    setLoading(true);
    try {
      const sourceParam = sourceFilter !== 'all' ? `&source=${sourceFilter}` : '';
      const response = await fetch(
        `${coordinatorUrl}/public/project-earnings/${accountId}/history?limit=50${sourceParam}`
      );
      if (response.ok) {
        const data: EarningsHistoryResponse = await response.json();
        setHistory(data.earnings);
        setTotalCount(data.total_count);
      }
    } catch (err) {
      console.error('Failed to load earnings history:', err);
      setError('Failed to load earnings history');
    } finally {
      setLoading(false);
    }
  }, [accountId, coordinatorUrl, sourceFilter]);

  // Withdraw blockchain earnings
  const handleWithdraw = async () => {
    if (!accountId || BigInt(blockchainBalance || '0') <= BigInt(0)) return;

    setWithdrawing(true);
    setError(null);
    setSuccess(null);

    try {
      const action = actionCreators.functionCall(
        'withdraw_developer_earnings',
        {},
        BigInt('50000000000000'), // 50 TGas
        BigInt('1') // 1 yoctoNEAR required
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess(`Successfully withdrew ${formatUsd(blockchainBalance, stablecoin.decimals)} to your wallet!`);
      // Reload balances after withdrawal
      setTimeout(() => {
        loadBlockchainBalance();
        loadHistory();
      }, 2000);
    } catch (err) {
      setError((err as Error).message || 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  };

  // Load data when connected
  useEffect(() => {
    if (isConnected && accountId) {
      loadBlockchainBalance();
      loadHttpsBalance();
      loadHistory();
    }
  }, [isConnected, accountId, loadBlockchainBalance, loadHttpsBalance, loadHistory]);

  // Reload history when filter changes
  useEffect(() => {
    if (isConnected && accountId) {
      loadHistory();
    }
  }, [sourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
 <div className="w-full">
      <PageHeader
        title="Earnings"
        description="Track earnings from blockchain calls and HTTPS API calls to your projects."
        action={
          isConnected ? (
            <Button onClick={() => { loadBlockchainBalance(); loadHttpsBalance(); loadHistory(); }}>
              Refresh
            </Button>
          ) : undefined
        }
      />

      {!isConnected && (
        <div className="mb-6">
          <RequireWallet subject="your earnings" />
        </div>
      )}

      {/* Error/Success Display */}
      {error && (
 <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-md p-3">
 <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}
      {success && (
 <div className="mt-4 bg-success/10 border border-success/30 rounded-md p-3">
 <p className="text-sm text-success-text">{success}</p>
        </div>
      )}

      {/* Balance Cards - Two Columns */}
      {isConnected && (
 <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Blockchain Earnings Card */}
 <div className="bg-card rounded-lg p-6 border border-border">
 <div className="flex items-center mb-4">
 <div className="flex-shrink-0">
 <div className="w-12 h-12 bg-card-muted rounded-full flex items-center justify-center">
 <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                </div>
              </div>
 <div className="ml-4">
 <p className="text-sm font-medium text-muted-foreground">Blockchain Earnings</p>
 <p className="text-xs text-muted-foreground">From smart contract calls</p>
              </div>
            </div>
 <p className="text-3xl font-bold text-foreground tabular-nums mb-4">
              {formatUsd(blockchainBalance, stablecoin.decimals)}
            </p>
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || BigInt(blockchainBalance || '0') <= BigInt(0)}
 className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {withdrawing ? (
                <>
 <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Withdrawing...
                </>
              ) : (
 <>Withdraw to Wallet</>
              )}
            </button>
 <p className="mt-2 text-xs text-muted-foreground">
              Stored in OutLayer contract
            </p>
          </div>

          {/* HTTPS Earnings Card */}
 <div className="bg-card rounded-lg p-6 border border-border">
 <div className="flex items-center mb-4">
 <div className="flex-shrink-0">
 <div className="w-12 h-12 bg-card-muted rounded-full flex items-center justify-center">
 <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </div>
              </div>
 <div className="ml-4">
 <p className="text-sm font-medium text-muted-foreground">HTTPS API Earnings</p>
 <p className="text-xs text-muted-foreground">From payment key calls</p>
              </div>
            </div>
 <p className="text-3xl font-bold text-foreground tabular-nums mb-4">
              {httpsBalance ? formatUsd(httpsBalance.balance, stablecoin.decimals) : '$0.000000'}
            </p>
            <button
              disabled
 className="inline-flex items-center px-4 py-2 border border-border-strong text-sm font-medium rounded-lg text-faint-foreground bg-card-muted cursor-not-allowed"
              title="Withdrawal coming soon"
            >
              Withdraw (Coming Soon)
            </button>
 <p className="mt-2 text-xs text-muted-foreground">
              Stored in coordinator database
            </p>
          </div>
        </div>
      )}

      {/* Total Summary */}
      {isConnected && (
 <div className="mt-4 bg-card border border-border rounded-lg p-4">
 <div className="flex items-center justify-between">
 <span className="text-sm font-medium text-muted-foreground">Total Available</span>
 <span className="text-xl font-bold tabular-nums text-foreground">
              {formatUsd(
                (BigInt(blockchainBalance || '0') + BigInt(httpsBalance?.balance || '0')).toString(),
                stablecoin.decimals
              )}
            </span>
          </div>
        </div>
      )}

      {/* Earnings History */}
      {isConnected && (
 <div className="mt-8 bg-card border border-border rounded-lg overflow-hidden">
 <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
 <h2 className="text-sm font-semibold text-foreground">
              Earnings History
              {totalCount > 0 && (
 <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({totalCount} total)
                </span>
              )}
            </h2>
            {/* Source Filter */}
 <div className="flex gap-2">
              <button
                onClick={() => setSourceFilter('all')}
 className={`px-3 py-1 text-xs font-medium rounded-full ${
                  sourceFilter === 'all'
                    ? 'bg-accent text-on-accent border border-accent'
                    : 'bg-card text-muted-foreground border border-border-strong hover:border-accent hover:text-accent-text'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSourceFilter('blockchain')}
 className={`px-3 py-1 text-xs font-medium rounded-full ${
                  sourceFilter === 'blockchain'
                    ? 'bg-accent text-on-accent border border-accent'
                    : 'bg-card text-muted-foreground border border-border-strong hover:border-accent hover:text-accent-text'
                }`}
              >
                Blockchain
              </button>
              <button
                onClick={() => setSourceFilter('https')}
 className={`px-3 py-1 text-xs font-medium rounded-full ${
                  sourceFilter === 'https'
                    ? 'bg-accent text-on-accent border border-accent'
                    : 'bg-card text-muted-foreground border border-border-strong hover:border-accent hover:text-accent-text'
                }`}
              >
                HTTPS
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 px-6 py-8">
              <span className="h-8 w-8 shrink-0 animate-spin rounded-full border-b-2 border-accent" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">Loading history…</span>
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              }
              title="No earnings yet"
              description="Earnings will appear here when users call your projects with attached deposits."
            />
          ) : (
 <div className="overflow-x-auto">
 <table className="w-full text-sm">
 <thead>
 <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">
 <th className="px-6 py-3 font-semibold">Date</th>
 <th className="px-6 py-3 font-semibold">Source</th>
 <th className="px-6 py-3 font-semibold">Project</th>
 <th className="px-6 py-3 font-semibold">Details</th>
 <th className="px-6 py-3 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
 <tbody className="divide-y divide-border">
                  {history.map((record) => (
 <tr key={record.id} className="hover:bg-card-muted">
 <td className="px-6 py-4 text-foreground">
                        {new Date(record.created_at * 1000).toLocaleString()}
                      </td>
 <td className="px-6 py-4">
                        {record.source === 'blockchain' ? (
 <span className="inline-flex items-center px-2 py-0.5 rounded border border-border-strong text-xs font-medium text-muted-foreground">
                            Blockchain
                          </span>
                        ) : (
 <span className="inline-flex items-center px-2 py-0.5 rounded border border-border-strong text-xs font-medium text-muted-foreground">
                            HTTPS
                          </span>
                        )}
                      </td>
 <td className="px-6 py-4">
 <span className="text-accent-text font-mono text-xs">
                          {record.project_id.length > 20
                            ? record.project_id.slice(0, 20) + '...'
                            : record.project_id}
                        </span>
                      </td>
 <td className="px-6 py-4 text-xs text-muted-foreground">
                        {record.source === 'blockchain' ? (
                          record.caller ? (
 <span>by {record.caller.length > 15 ? record.caller.slice(0, 15) + '...' : record.caller}</span>
                          ) : '-'
                        ) : (
                          record.payment_key_owner ? (
 <span>{record.payment_key_owner}#{record.payment_key_nonce}</span>
                          ) : '-'
                        )}
                      </td>
 <td className="px-6 py-4 text-right">
                        <div>
 <span className="font-semibold tabular-nums text-success-text">
                            +{formatUsd(record.amount, stablecoin.decimals)}
                          </span>
                          {BigInt(record.refund_usd || '0') > BigInt(0) && (
 <span className="text-xs text-faint-foreground ml-1">
                              (refund: {formatUsd(record.refund_usd, stablecoin.decimals)})
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
 <div className="mt-8 max-w-3xl bg-card-muted border border-border rounded-lg p-4">
 <h3 className="text-sm font-semibold text-foreground mb-3">
          About Earnings
        </h3>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div>
 <h4 className="font-medium text-foreground mb-1">Blockchain Earnings</h4>
 <ul className="space-y-1 list-disc list-inside text-xs">
 <li>From request_execution with attached_usd</li>
 <li>Stored in OutLayer smart contract</li>
 <li>Withdraw directly to your wallet</li>
            </ul>
          </div>
          <div>
 <h4 className="font-medium text-foreground mb-1">HTTPS API Earnings</h4>
 <ul className="space-y-1 list-disc list-inside text-xs">
 <li>From payment key calls with X-Attached-Deposit</li>
 <li>Stored in coordinator database</li>
 <li>Withdrawal coming soon</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
