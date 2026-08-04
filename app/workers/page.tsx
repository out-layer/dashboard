'use client';

import { useEffect, useState } from 'react';
import { fetchWorkers, WorkerInfo } from '@/lib/api';
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

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkers();
    const interval = setInterval(loadWorkers, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const loadWorkers = async () => {
    try {
      const data = await fetchWorkers();
      setWorkers(data);
      setError(null);
    } catch (err) {
      setError('Failed to load workers');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatUptime = (seconds: number | null) => {
    if (!seconds) return '—';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const online = workers.filter((w) => w.status === 'online' || w.status === 'busy').length;

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
        <p className="text-sm text-destructive-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Workers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The TEE fleet executing off-chain computation. Every worker&apos;s enclave is
            independently verifiable.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="tabular-nums font-semibold text-foreground">{online}</span> online ·
          <a href="https://workers.outlayer.ai" target="_blank" rel="noreferrer">
            <AttestationBadge label="Fleet attestation" />
          </a>
        </div>
      </div>

      <Card className="mt-6 overflow-hidden rounded-md">
        {workers.length === 0 ? (
          <EmptyState
            title="No workers found"
            description="The coordinator reported an empty fleet for this network."
            className="border-0"
          />
        ) : (
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
        )}
      </Card>
    </div>
  );
}
