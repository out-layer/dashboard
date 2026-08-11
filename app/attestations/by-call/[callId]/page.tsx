'use client';

import { PageHeader } from '@/components/ui/page-header';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getCoordinatorApiUrl, NetworkType } from '@/lib/api';

/**
 * Resolver for the URL a guest can compute about ITSELF. During a run the code only knows its
 * call id (OUTLAYER_CALL_ID) — the numeric task id is assigned coordinator-side — so links
 * embedded into attestations point here, and this page finds the record and forwards to the
 * canonical /attestation/{task_id}?network=… page. The path mirrors the coordinator's own
 * /attestations/by-call/{id} on purpose: swapping the host is all it takes to turn the API URL
 * into this human one. A call id is a UUID, so probing both networks cannot be ambiguous.
 */
export default function AttestationByCallPage() {
  const params = useParams();
  const router = useRouter();
  const callId = params?.callId as string;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;

    (async () => {
      const networks: NetworkType[] = ['mainnet', 'testnet'];
      const probes = networks.map(async (net) => {
        const res = await fetch(
          `${getCoordinatorApiUrl(net)}/attestations/by-call/${encodeURIComponent(callId)}`
        );
        if (!res.ok) throw new Error(String(res.status));
        const att = await res.json();
        if (att?.task_id == null) throw new Error('no task_id');
        return { net, taskId: att.task_id as number };
      });
      try {
        const hit = await Promise.any(probes);
        if (!cancelled) router.replace(`/attestation/${hit.taskId}?network=${hit.net}`);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [callId, router]);

  return (
    <div>
      <PageHeader
        title="Execution attestation"
        description="Looking up the run this call id belongs to…"
      />
      {failed ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            No attestation found for call <span className="font-mono">{callId}</span>.
          </p>
          <p className="mt-2">
            Neither network&apos;s coordinator has a record under this call id. If the run just
            finished, the record can take a moment to land — reload in a few seconds.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
          Resolving…
        </div>
      )}
    </div>
  );
}
