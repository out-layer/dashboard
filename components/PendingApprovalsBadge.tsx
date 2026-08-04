'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';

// Poll once per minute globally — single leader across all tabs +
// all pages of the dashboard. Followers (other tabs, other browser
// windows) receive the result via BroadcastChannel without hitting
// the coordinator themselves. The /wallet/approvals page listens on
// the same channel and uses these broadcasts as its data source.
const POLL_INTERVAL_MS = 60_000;
const LOCK_NAME = 'outlayer-approvals-poller';
const CHANNEL_NAME = 'outlayer-approvals-results';

export default function PendingApprovalsBadge() {
  const { accountId, isConnected, network, contractId, viewMethod } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const [count, setCount] = useState(0);
  // Stable ref for viewMethod to avoid re-triggering useEffect on every render
  const viewMethodRef = useRef(viewMethod);
  viewMethodRef.current = viewMethod;

  const fetchAndBroadcast = useCallback(
    async (channel: BroadcastChannel | null) => {
      if (!accountId || !contractId) return;
      try {
        const wallets = await viewMethodRef.current({
          contractId,
          method: 'get_wallet_policies_by_owner',
          args: { owner: accountId },
 }).catch(() => []) as Array<{ wallet_pubkey: string }>;

        const allApprovals: Array<{ wallet_pubkey: string } & Record<string, unknown>> = [];
        for (const w of wallets) {
          try {
            const resp = await fetch(
              `${coordinatorUrl}/wallet/v1/pending_approvals_by_pubkey?near_pubkey=${encodeURIComponent(w.wallet_pubkey)}`,
            );
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data.pending_approvals) {
              for (const pa of data.pending_approvals) {
                allApprovals.push({ ...pa, wallet_pubkey: w.wallet_pubkey });
              }
            }
          } catch { /* skip */ }
        }
        setCount(allApprovals.length);
        // Broadcast full approvals payload so the /wallet/approvals
        // page (when open in another tab) consumes the same fetch.
        channel?.postMessage({ type: 'approvals-update', approvals: allApprovals });
      } catch { /* skip */ }
    },
    [accountId, contractId, coordinatorUrl],
  );

  useEffect(() => {
    if (!isConnected || !accountId) { setCount(0); return; }

    const channel =
      typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(CHANNEL_NAME)
        : null;

    // Followers update their badge count when ANY tab broadcasts.
    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === 'approvals-update' && Array.isArray(event.data.approvals)) {
          setCount(event.data.approvals.length);
        }
      };
    }

    let cancelled = false;
    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let releaseLock: (() => void) | null = null;

    const startLeaderPolling = () => {
      if (cancelled) return;
      // Immediate fetch when becoming leader, then once per minute.
      fetchAndBroadcast(channel);
      pollIntervalId = setInterval(() => fetchAndBroadcast(channel), POLL_INTERVAL_MS);
    };

    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks && typeof locks.request === 'function') {
      locks.request(
        LOCK_NAME,
        { mode: 'exclusive' },
        () =>
          new Promise<void>((release) => {
            if (cancelled) { release(); return; }
            releaseLock = release;
            startLeaderPolling();
          }),
      );
    } else {
      // No Web Locks API — every tab polls independently. Acceptable
      // fallback; modern browsers all support locks.
      startLeaderPolling();
    }

    return () => {
      cancelled = true;
      if (pollIntervalId) clearInterval(pollIntervalId);
      if (releaseLock) releaseLock();
      channel?.close();
    };
  }, [isConnected, accountId, fetchAndBroadcast]);

  if (count <= 0) return null;
  return (
 <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-destructive rounded-full">
      {count}
    </span>
  );
}
