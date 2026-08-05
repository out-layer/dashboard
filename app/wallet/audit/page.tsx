'use client';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { getAllWalletKeys } from '@/lib/wallet-keys';

interface AuditEvent {
  type: string;
  request_id: string | null;
  status: string | null;
  details: Record<string, unknown>;
  at: string;
}

interface WalletEntry {
  pubkey: string;
  apiKey: string;
  walletId: string;
  label: string;
  events: AuditEvent[];
  error?: string;
  hasMore: boolean;
  page: number;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  withdraw: 'bg-card-muted text-foreground',
  withdraw_pending_approval: 'bg-warning/10 text-warning',
  withdraw_auto_executed: 'bg-success/10 text-success-text',
  deposit: 'bg-success/10 text-success-text',
  policy_change: 'bg-card-muted text-foreground',
  approval: 'bg-info/10 text-info',
  freeze: 'bg-destructive/10 text-destructive-text',
  unfreeze: 'bg-card-muted text-foreground',
};

const PAGE_SIZE = 50;

export default function WalletAuditPage() {
  return (
 <Suspense fallback={<div className="w-full py-8 text-faint-foreground">Loading...</div>}>
      <WalletAuditContent />
    </Suspense>
  );
}

function WalletAuditContent() {
  const { network } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const searchParams = useSearchParams();

  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWallet, setSelectedWallet] = useState<string>('all'); // 'all' or walletId
  const [manualKeyInput, setManualKeyInput] = useState('');
  const [noKeys, setNoKeys] = useState(false);
  const loadedRef = useRef(false);

  // Fetch wallet address + first page of events for a single key
  const fetchWalletData = useCallback(async (
    pubkey: string,
    apiKey: string,
    label: string | undefined,
    page: number,
  ): Promise<WalletEntry> => {
    const addrResp = await fetch(`${coordinatorUrl}/wallet/v1/address?chain=near`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!addrResp.ok) {
      const err = await addrResp.json().catch(() => ({ error: addrResp.statusText }));
      throw new Error(err.error || err.message || `API error: ${addrResp.status}`);
    }
    const addrData = await addrResp.json();
    const walletId = addrData.wallet_id as string;

    const params = new URLSearchParams({
      limit: PAGE_SIZE.toString(),
      offset: (page * PAGE_SIZE).toString(),
    });
    const auditResp = await fetch(`${coordinatorUrl}/wallet/v1/audit?${params}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!auditResp.ok) {
      const err = await auditResp.json().catch(() => ({ error: auditResp.statusText }));
      throw new Error(err.error || err.message || `API error: ${auditResp.status}`);
    }
    const auditData = await auditResp.json();
    const events: AuditEvent[] = auditData.events || [];

    return {
      pubkey,
      apiKey,
      walletId,
      label: label || walletId.substring(0, 16),
      events,
      hasMore: events.length === PAGE_SIZE,
      page,
    };
  }, [coordinatorUrl]);

  // Initial load: gather all keys and fetch data
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const keyFromUrl = searchParams.get('key');
    const saved = getAllWalletKeys();

    // Collect unique keys
    const keyMap = new Map<string, { pubkey: string; apiKey: string; label?: string }>();

    if (keyFromUrl) {
      keyMap.set(keyFromUrl, { pubkey: '_url', apiKey: keyFromUrl, label: 'URL key' });
    }

    for (const [pubkey, stored] of Object.entries(saved)) {
      if (!keyMap.has(stored.apiKey)) {
        keyMap.set(stored.apiKey, { pubkey, apiKey: stored.apiKey, label: stored.label });
      }
    }

    if (keyMap.size === 0) {
      setNoKeys(true);
      setLoading(false);
      return;
    }

    const entries = Array.from(keyMap.values());

    // If only URL key, auto-select it
    if (keyFromUrl && entries.length === 1) {
      setSelectedWallet('_single');
    }

    Promise.allSettled(
      entries.map(e => fetchWalletData(e.pubkey, e.apiKey, e.label, 0))
    ).then(results => {
      const loaded: WalletEntry[] = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') {
          loaded.push(r.value);
        } else {
          loaded.push({
            ...entries[i],
            walletId: '',
            label: entries[i].label || entries[i].pubkey.substring(0, 16),
            events: [],
            error: (r.reason as Error).message,
            hasMore: false,
            page: 0,
          });
        }
      }
      setWallets(loaded);
      setLoading(false);
    });
  }, [searchParams, fetchWalletData]);

  // Load next/prev page for a specific wallet
  const loadPage = useCallback(async (walletId: string, newPage: number) => {
    const wallet = wallets.find(w => w.walletId === walletId);
    if (!wallet) return;

    setWallets(prev => prev.map(w =>
      w.walletId === walletId ? { ...w, page: newPage, events: [] } : w
    ));
    setLoading(true);

    try {
      const updated = await fetchWalletData(wallet.pubkey, wallet.apiKey, wallet.label, newPage);
      setWallets(prev => prev.map(w => w.walletId === walletId ? updated : w));
    } catch (err) {
      setWallets(prev => prev.map(w =>
        w.walletId === walletId ? { ...w, error: (err as Error).message, events: [], page: newPage } : w
      ));
    } finally {
      setLoading(false);
    }
  }, [wallets, fetchWalletData]);

  const handleManualKeySubmit = useCallback(() => {
    const key = manualKeyInput.trim();
    if (!key) return;
    setManualKeyInput('');
    setLoading(true);
    setNoKeys(false);

    fetchWalletData('_manual', key, 'Manual key', 0).then(entry => {
      setWallets(prev => {
        if (prev.some(w => w.walletId === entry.walletId)) return prev;
        return [...prev, entry];
      });
      setSelectedWallet(entry.walletId);
    }).catch(err => {
      setWallets(prev => [...prev, {
        pubkey: '_manual',
        apiKey: key,
        walletId: `_err_${Date.now()}`,
        label: 'Manual key',
        events: [],
        error: (err as Error).message,
        hasMore: false,
        page: 0,
      }]);
    }).finally(() => setLoading(false));
  }, [manualKeyInput, fetchWalletData]);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString();

  const shortenId = (id: string) => {
    if (id.length <= 24) return id;
    return `${id.substring(0, 12)}...${id.substring(id.length - 8)}`;
  };

  // Compute visible events
  const multiWallet = wallets.length > 1;
  const visibleWallets = selectedWallet === 'all' || selectedWallet === '_single'
    ? wallets
    : wallets.filter(w => w.walletId === selectedWallet);

  // Merge events from visible wallets, annotated with wallet info
  const mergedEvents = visibleWallets
    .flatMap(w => w.events.map(e => ({ ...e, _walletId: w.walletId, _walletLabel: w.label })))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Pagination: only available when single wallet is selected
  const singleWallet = visibleWallets.length === 1 ? visibleWallets[0] : null;

  // Errors from visible wallets
  const errors = visibleWallets.filter(w => w.error).map(w => `${w.label}: ${w.error}`);

  // No keys at all - show manual input
  if (noKeys && wallets.length === 0) {
    return (
 <div className="w-full">
        <PageHeader title="Audit log" />
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="mb-3 text-sm text-muted-foreground">
            No saved wallet keys found. Enter an API key to view the audit log.
          </p>
          <div className="flex max-w-xl gap-2">
            <input
              type="text"
              value={manualKeyInput}
              onChange={(e) => setManualKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualKeySubmit()}
              placeholder="wk_..."
              className="min-w-0 flex-1 rounded-md border border-border-strong px-3 py-2 font-mono text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <Button onClick={handleManualKeySubmit} disabled={!manualKeyInput.trim()}>
              Load
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
 <div className="w-full">
      <PageHeader
        title="Audit log"
        description="Signed operations recorded for your agent wallets."
      />

      {/* Wallet filter tabs */}
      {multiWallet && (
 <div className="flex items-center gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setSelectedWallet('all')}
 className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              selectedWallet === 'all'
                ? 'bg-accent text-on-accent border-accent'
                : 'bg-card text-muted-foreground border-border-strong hover:border-accent'
            }`}
          >
            All wallets ({wallets.length})
          </button>
          {wallets.map(w => (
            <button
              key={w.walletId}
              onClick={() => setSelectedWallet(w.walletId)}
 className={`px-3 py-1.5 text-sm rounded-lg border transition-colors font-mono ${
                selectedWallet === w.walletId
                  ? 'bg-accent text-on-accent border-accent'
                  : 'bg-card text-muted-foreground border-border-strong hover:border-accent'
              }`}
            >
              {w.label}
              {w.error && <span className="ml-1 text-destructive-text">!</span>}
            </button>
          ))}
        </div>
      )}

      {errors.length > 0 && (
 <div className="mb-4 bg-destructive/10 border border-destructive/30 rounded-md p-3">
          {errors.map((e, i) => (
 <p key={i} className="text-sm text-destructive-text">{e}</p>
          ))}
        </div>
      )}

      {/* Events table */}
      {loading && mergedEvents.length === 0 ? (
        <div className="flex items-center gap-3 py-8">
          <span className="h-8 w-8 shrink-0 animate-spin rounded-full border-b-2 border-accent" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">Loading audit log…</span>
        </div>
      ) : mergedEvents.length === 0 ? (
        <EmptyState
          title="No audit events yet"
          description="Signed operations from your agent wallets will appear here."
        />
      ) : (
        <>
 <div className="bg-card border border-border rounded-lg overflow-hidden">
 <table className="min-w-full divide-y divide-border">
 <thead className="bg-card-muted">
                <tr>
 <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Time
                  </th>
                  {multiWallet && selectedWallet === 'all' && (
 <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Wallet
                    </th>
                  )}
 <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
 <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Details
                  </th>
 <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Request
                  </th>
                </tr>
              </thead>
 <tbody className="bg-card divide-y divide-border">
                {mergedEvents.map((event, i) => (
 <tr key={`${event._walletId}-${i}`} className="hover:bg-card-muted">
 <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(event.at)}
                    </td>
                    {multiWallet && selectedWallet === 'all' && (
 <td className="px-4 py-3 whitespace-nowrap text-xs text-faint-foreground font-mono">
                        {event._walletLabel}
                      </td>
                    )}
 <td className="px-4 py-3 whitespace-nowrap">
                      <span
 className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          EVENT_TYPE_COLORS[event.type] || 'bg-card-muted text-foreground'
                        }`}
                      >
                        {event.type}
                      </span>
                    </td>
 <td className="px-4 py-3 text-xs text-muted-foreground max-w-md">
 <pre className="whitespace-pre-wrap break-all">
                        {(JSON.stringify(event.details ?? {}, null, 2) || '{}').substring(0, 200)}
                        {(JSON.stringify(event.details ?? {}) || '{}').length > 200 ? '...' : ''}
                      </pre>
                    </td>
 <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {event.request_id ? shortenId(event.request_id) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination - only when single wallet is focused */}
          {singleWallet && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadPage(singleWallet.walletId, Math.max(0, singleWallet.page - 1))}
                disabled={singleWallet.page === 0 || loading}
              >
                Previous
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                Page {singleWallet.page + 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadPage(singleWallet.walletId, singleWallet.page + 1)}
                disabled={!singleWallet.hasMore || loading}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
