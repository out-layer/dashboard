'use client';

import { useEffect, useState } from 'react';
import {
  AttestationResponse,
  JobHistoryEntry,
  fetchJobById,
  NetworkType,
} from '@/lib/api';
import { HashChip } from '@/components/ui/hash-chip';

/**
 * Everything we know about one execution, in one box: who ran it, what code,
 * on which worker, what it cost and what it produced. Pulls the fields split
 * between the attestation record and the job-history row (the latter needs a
 * coordinator with the `job_id` filter; absent → those rows just don't show).
 * Rendered at the bottom of both the attestation modal and the full page.
 */
export default function ExecutionDetails({
  attestation,
  network,
}: {
  attestation: AttestationResponse;
  network: NetworkType;
}) {
  const [job, setJob] = useState<JobHistoryEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    setJob(null);
    fetchJobById(attestation.task_id, network).then((j) => !cancelled && setJob(j));
    return () => {
      cancelled = true;
    };
  }, [attestation.task_id, network]);

  const explorer =
    network === 'testnet' ? 'https://testnet.nearblocks.io' : 'https://nearblocks.io';

  const isHttps = !!attestation.call_id;
  const startedBy =
    attestation.caller_account_id ||
    (attestation.payment_key_owner
      ? `${attestation.payment_key_owner}#${attestation.payment_key_nonce ?? ''}`
      : job?.user_account_id || null);

  const nearPaid = job?.near_payment_yocto
    ? (Number(job.near_payment_yocto) / 1e24).toFixed(6)
    : null;
  const usdCost = job?.compute_cost_usd
    ? `$${(Number(job.compute_cost_usd) / 1e6).toFixed(6)}`
    : null;
  const attachedUsd =
    attestation.attached_usd && attestation.attached_usd !== '0'
      ? `$${(Number(attestation.attached_usd) / 1e6).toFixed(6)}`
      : null;

  const rows: Array<{ label: string; value: React.ReactNode; title?: string }> = [];
  const push = (label: string, value: React.ReactNode, title?: string) => {
    if (value !== null && value !== undefined && value !== '') rows.push({ label, value, title });
  };

  push('Job', <span className="tabular-nums">#{attestation.task_id}</span>);
  push('Type', attestation.task_type === 'compile' ? 'Compilation' : 'Execution');
  push('Channel', isHttps ? 'HTTPS API' : 'NEAR (on-chain)');
  if (job?.status) push('Status', job.status);
  push('Started by', startedBy ? <HashChip value={startedBy} trim={0} /> : null);
  push(
    'Project',
    attestation.project_id || job?.project_id ? (
      <HashChip value={(attestation.project_id || job?.project_id)!} trim={0} />
    ) : null,
  );
  push('Secrets profile', attestation.secrets_ref ? <HashChip value={attestation.secrets_ref} trim={0} /> : null);

  const repo = attestation.repo_url || job?.github_repo;
  const commit = attestation.commit_hash || job?.github_commit;
  push(
    'Source code',
    repo ? (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <a
          href={repo}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text hover:underline"
        >
          {repo.replace('https://github.com/', '')}
        </a>
        {commit && <HashChip value={commit} trim={8} />}
      </span>
    ) : null,
  );
  push('Build target', attestation.build_target || null);
  push('WASM hash', attestation.wasm_hash ? <HashChip value={attestation.wasm_hash} /> : null,
    'SHA-256 of the exact WebAssembly binary that executed');
  push('Input hash', attestation.input_hash ? <HashChip value={attestation.input_hash} /> : null,
    'SHA-256 of the input the code received');
  push('Output hash', attestation.output_hash ? <HashChip value={attestation.output_hash} /> : null,
    'SHA-256 of the output the code produced');
  push(
    'Worker',
    job?.worker_id ? <HashChip value={job.worker_id} trim={0} /> : null,
    'The TEE worker (network-type-version) that ran this job',
  );
  push(
    'Enclave measurement',
    attestation.worker_measurement ? <HashChip value={attestation.worker_measurement} /> : null,
    'TDX measurement of the worker build, approved on-chain',
  );
  push(
    'Execution time',
    job?.execution_time_ms != null ? (
      <span className="tabular-nums">{job.execution_time_ms.toLocaleString('en-US')} ms</span>
    ) : null,
  );
  push(
    'Compile time',
    job?.compile_time_ms != null ? (
      <span className="tabular-nums">{job.compile_time_ms.toLocaleString('en-US')} ms</span>
    ) : null,
  );
  push(
    'Instructions',
    job?.instructions_used != null ? (
      <span className="tabular-nums">{job.instructions_used.toLocaleString('en-US')}</span>
    ) : null,
    'WASM instructions metered inside the enclave — the compute unit billing is based on',
  );
  push('NEAR paid', nearPaid ? <span className="tabular-nums">{nearPaid} NEAR</span> : null);
  push('Compute cost', usdCost ? <span className="tabular-nums">{usdCost}</span> : null);
  push('Attached deposit', attachedUsd ? <span className="tabular-nums">{attachedUsd}</span> : null,
    'USD attached to the call — paid out to the project owner');
  push(
    'Request transaction',
    attestation.transaction_hash || job?.transaction_hash ? (
      <a
        href={`${explorer}/txns/${attestation.transaction_hash || job?.transaction_hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-accent-text hover:underline"
      >
        {(attestation.transaction_hash || job?.transaction_hash)!.slice(0, 12)}… ↗
      </a>
    ) : null,
  );
  push(
    'Result transaction',
    job?.resolve_tx_id ? (
      <a
        href={`${explorer}/txns/${job.resolve_tx_id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono text-xs text-accent-text hover:underline"
      >
        {job.resolve_tx_id.slice(0, 12)}… ↗
      </a>
    ) : null,
    'The resolve_execution call that returned the result on-chain',
  );
  push('Call id', attestation.call_id ? <HashChip value={attestation.call_id} /> : null);
  if (attestation.block_height) {
    push('Block height', <span className="tabular-nums">{attestation.block_height.toLocaleString('en-US')}</span>);
  }
  push(
    'Executed at',
    attestation.timestamp ? new Date(attestation.timestamp * 1000).toLocaleString() : job?.created_at ? new Date(job.created_at).toLocaleString() : null,
  );

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Execution details</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Everything recorded about this run — the hashes above are the same ones bound into the
        enclave-signed quote.
      </p>
      <table className="mt-3 w-full text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <td
                className="w-44 py-1.5 pr-3 align-top text-muted-foreground"
                title={r.title}
              >
                {r.label}
              </td>
              <td className="py-1.5">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
