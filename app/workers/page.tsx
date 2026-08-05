'use client';

import { PageHeader } from '@/components/ui/page-header';
import { useEffect, useState } from 'react';
import { fetchWorkers, WorkerInfo, NetworkType } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AttestationBadge } from '@/components/ui/attestation-badge';
import { HashChip } from '@/components/ui/hash-chip';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Where a worker's TEE attestation can be independently verified.
 * Routing convention: Phala-hosted workers carry "phala" in their name/id and
 * verify on that host's explorer; self-hosted TDX workers verify on our own
 * attestation portal (workers.outlayer.ai/app/<app_id>).
 */
function attestationUrlFor(worker: WorkerInfo): string | null {
  const parts = worker.worker_id.split('-');
  const network = parts[0];
  const workerType = parts[1];
  const appId = parts.length >= 3 ? parts.slice(2).join('-') : null;
  const hasAppId = appId && /^[a-f0-9]{40}$/i.test(appId);
  const isPhala = /phala/i.test(worker.worker_id) || /phala/i.test(worker.worker_name);

  if (hasAppId) {
    return isPhala
      ? `https://trust.phala.com/app/${appId}?selected=app-code`
      : `https://workers.outlayer.ai/app/${appId}`;
  }
  if (workerType === 'keystore' && (network === 'testnet' || network === 'mainnet')) {
    // Keystore rows are synthesized by the coordinator without an app_id suffix
    // (one keystore per network). The portal resolves the current keystore for
    // the network and redirects to its attestation page.
    return `https://workers.outlayer.ai/${network}-keystore`;
  }
  return null;
}

/**
 * Stable presentation order: alive first, then by worker id, then by instance.
 * Never by heartbeat — that reshuffles rows on every 10s refresh.
 */
function sortWorkers(list: WorkerInfo[]): WorkerInfo[] {
  const aliveRank = (w: WorkerInfo) => (w.status === 'online' || w.status === 'busy' ? 0 : 1);
  return [...list].sort(
    (a, b) =>
      aliveRank(a) - aliveRank(b) ||
      a.worker_id.localeCompare(b.worker_id) ||
      (a.instance ?? '').localeCompare(b.instance ?? ''),
  );
}

function formatUptime(seconds: number | null) {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function WorkersTable({ workers }: { workers: WorkerInfo[] }) {
  if (workers.length === 0) {
    return (
      <EmptyState
        title="No workers found"
        description="The coordinator reported an empty fleet for this network."
        className="border-0"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">
            <th className="px-4 py-3">Worker</th>
            <th className="px-4 py-3">Instance</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Attestation</th>
            <th className="px-4 py-3 text-right">Completed</th>
            <th className="px-4 py-3 text-right">Failed</th>
            <th className="px-4 py-3">Uptime</th>
            <th className="px-4 py-3">Last heartbeat</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => {
            const attestationUrl = attestationUrlFor(worker);
            const alive = worker.status === 'online' || worker.status === 'busy';
            return (
              // Several instances share a worker_id (it encodes the version, not
              // the machine), so the attested instance key is part of the row key.
              <tr
                key={`${worker.worker_id}:${worker.instance ?? ''}`}
                className="border-b border-border last:border-0 hover:bg-card-muted/60"
              >
                <td className="px-4 py-3 font-mono text-xs">{worker.worker_id}</td>
                <td className="px-4 py-3">
                  {worker.instance ? (
                    <HashChip value={worker.instance} trim={0} title="Prefix of this worker's attested public key (registered on-chain)" />
                  ) : (
                    <span className="text-faint-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={alive ? 'success' : 'outline'}>{worker.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  {attestationUrl ? (
                    <a href={attestationUrl} target="_blank" rel="noopener noreferrer">
                      <AttestationBadge label="Verify" href={undefined} />
                    </a>
                  ) : (
                    <span className="text-faint-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{worker.total_tasks_completed}</td>
                <td className="px-4 py-3 text-right tabular-nums">{worker.total_tasks_failed}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatUptime(worker.uptime_seconds)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(worker.last_heartbeat_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const NETWORKS: NetworkType[] = ['mainnet', 'testnet'];

interface FleetState {
  workers: WorkerInfo[];
  failed: boolean;
}

export default function WorkersPage() {
  const [fleets, setFleets] = useState<Record<NetworkType, FleetState>>({
    mainnet: { workers: [], failed: false },
    testnet: { workers: [], failed: false },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkers();
    const interval = setInterval(loadWorkers, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadWorkers = async () => {
    // Both networks in parallel; one failing does not blank the other.
    const [main, test] = await Promise.allSettled(
      NETWORKS.map((n) => fetchWorkers(n)),
    );
    setFleets({
      mainnet:
        main.status === 'fulfilled'
          ? { workers: sortWorkers(main.value), failed: false }
          : { workers: [], failed: true },
      testnet:
        test.status === 'fulfilled'
          ? { workers: sortWorkers(test.value), failed: false }
          : { workers: [], failed: true },
    });
    setLoading(false);
  };

  const online = NETWORKS.flatMap((n) => fleets[n].workers).filter(
    (w) => w.status === 'online' || w.status === 'busy',
  ).length;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-accent" />
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Workers"
        description="The TEE fleet executing off-chain computation, across both networks. Every worker's enclave is independently verifiable."
        action={
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{online}</span> online ·
            <a href="https://workers.outlayer.ai" target="_blank" rel="noreferrer">
              <AttestationBadge label="Fleet attestation" />
            </a>
          </div>
        }
      />

      {NETWORKS.map((network) => (
        <section key={network} className="mb-8">
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold capitalize">{network}</h2>
            {!fleets[network].failed && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {fleets[network].workers.filter((w) => w.status === 'online' || w.status === 'busy').length}{' '}
                online / {fleets[network].workers.length} total
              </span>
            )}
          </div>
          {fleets[network].failed ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
              Failed to load {network} workers.
            </div>
          ) : (
            <Card className="overflow-hidden rounded-md">
              <WorkersTable workers={fleets[network].workers} />
            </Card>
          )}
        </section>
      ))}
    </div>
  );
}
