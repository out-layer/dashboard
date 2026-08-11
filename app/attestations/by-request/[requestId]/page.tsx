'use client';

import { PageHeader } from '@/components/ui/page-header';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCoordinatorApiUrl, NetworkType } from '@/lib/api';

/**
 * On-chain counterpart of /attestations/by-call/{id}: a guest running from a blockchain request
 * only knows NEAR_REQUEST_ID, so URLs it embeds about itself land here. Unlike a call id, a
 * request id is a per-network counter — the same number can exist on both networks as unrelated
 * runs — so this page redirects only when exactly one network answers and otherwise asks.
 */
export default function AttestationByRequestPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params?.requestId as string;
  const [hits, setHits] = useState<Array<{ net: NetworkType; taskId: number }> | null>(null);

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;

    (async () => {
      const networks: NetworkType[] = ['mainnet', 'testnet'];
      const found = (
        await Promise.all(
          networks.map(async (net) => {
            try {
              const res = await fetch(
                `${getCoordinatorApiUrl(net)}/attestations/by-request/${encodeURIComponent(requestId)}`
              );
              if (!res.ok) return null;
              const att = await res.json();
              return att?.task_id != null ? { net, taskId: att.task_id as number } : null;
            } catch {
              return null;
            }
          })
        )
      ).filter((h): h is { net: NetworkType; taskId: number } => h !== null);

      if (cancelled) return;
      if (found.length === 1) {
        // Same param passthrough as the by-call resolver — the resolved network wins.
        const extra = new URLSearchParams(window.location.search);
        extra.delete('network');
        const tail = extra.toString();
        router.replace(
          `/attestation/${found[0].taskId}?network=${found[0].net}${tail ? `&${tail}` : ''}`
        );
      } else {
        setHits(found);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestId, router]);

  return (
    <div>
      <PageHeader
        title="Execution attestation"
        description="Looking up the run this request id belongs to…"
      />
      {hits === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
          Resolving…
        </div>
      ) : hits.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            No attestation found for request <span className="font-mono">{requestId}</span>.
          </p>
          <p className="mt-2">
            Neither network&apos;s coordinator has a record under this request id. If the run just
            finished, the record can take a moment to land — reload in a few seconds.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            Request #{requestId} exists on both networks.
          </p>
          <p className="mt-2">
            Request ids are independent counters per network, so these are two unrelated runs —
            pick the one you came for:
          </p>
          <ul className="mt-3 space-y-1.5">
            {hits.map((h) => (
              <li key={h.net}>
                <Link
                  href={`/attestation/${h.taskId}?network=${h.net}`}
                  className="font-semibold text-accent-text hover:underline"
                >
                  {h.net} — job #{h.taskId} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
