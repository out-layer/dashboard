'use client';

import Link from 'next/link';
import {
  AttestationResponse,
  JobHistoryEntry,
  NetworkType,
} from '@/lib/api';
import { HashChip } from '@/components/ui/hash-chip';
import { attestationUrlFor } from '@/lib/worker-attestation';

/**
 * Everything we know about one execution, grouped by meaning: request, code,
 * infrastructure, cost, on-chain trail. Pulls the fields split between the
 * attestation record and the job-history row (the latter needs a coordinator
 * with the `job_id` filter; absent → those rows just don't show). Rendered at
 * the bottom of both the attestation modal and the full page.
 */

/** Full value on ≥sm screens, trimmed chip on mobile. */
function ResponsiveHash({ value }: { value: string }) {
  return (
    <>
      <HashChip value={value} trim={0} className="hidden break-all sm:inline-flex" />
      <HashChip value={value} className="sm:hidden" />
    </>
  );
}

function ExplorerLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="whitespace-nowrap text-accent-text hover:underline"
    >
      Open in explorer ↗
    </a>
  );
}

interface Row {
  label: string;
  value: React.ReactNode;
  title?: string;
}

export default function ExecutionDetails({
  attestation,
  network,
  job,
}: {
  attestation: AttestationResponse;
  network: NetworkType;
  job: JobHistoryEntry | null;
}) {

  const explorer =
    network === 'testnet' ? 'https://testnet.nearblocks.io' : 'https://nearblocks.io';

  const isHttps = !!attestation.call_id;

  // Same display formula as the Executions table: an execute job's actual cost
  // already includes the compile cost, so show the execute part alone.
  const paymentYocto = (() => {
    if (!job) return null;
    if (job.job_type === 'execute' && job.actual_cost_yocto && job.compile_cost_yocto) {
      return String(parseFloat(job.actual_cost_yocto) - parseFloat(job.compile_cost_yocto));
    }
    return job.compile_cost_yocto || job.actual_cost_yocto || job.near_payment_yocto;
  })();
  const paymentDisplay = isHttps
    ? job?.compute_cost_usd
      ? `$${(Number(job.compute_cost_usd) / 1e6).toFixed(6)}`
      : null
    : paymentYocto
      ? `${(Number(paymentYocto) / 1e24).toFixed(6)} NEAR`
      : null;
  const attachedUsd =
    attestation.attached_usd && attestation.attached_usd !== '0'
      ? `$${(Number(attestation.attached_usd) / 1e6).toFixed(6)}`
      : null;

  const callerAccount = attestation.caller_account_id || job?.user_account_id || null;
  const pkOwner = attestation.payment_key_owner || null;
  const repo = attestation.repo_url || job?.github_repo;
  const commit = attestation.commit_hash || job?.github_commit;
  const requestTx = attestation.transaction_hash || job?.transaction_hash || null;
  const workerVerifyUrl = job?.worker_id ? attestationUrlFor(job.worker_id) : null;

  const groups: Array<{ title: string; rows: Row[] }> = [];
  const add = (groupTitle: string, rows: Array<[string, React.ReactNode, string?]>) => {
    const kept = rows
      .filter(([, v]) => v !== null && v !== undefined && v !== '')
      .map(([label, value, title]) => ({ label, value, title }));
    if (kept.length) groups.push({ title: groupTitle, rows: kept });
  };

  add('Request', [
    ['Job', <span key="j" className="tabular-nums">#{attestation.task_id}</span>],
    ['Type', attestation.task_type === 'compile' ? 'Compilation' : 'Execution'],
    ['Channel', isHttps ? 'HTTPS API' : 'NEAR (on-chain)'],
    ['Status', job?.status ?? null],
    [
      'Started by',
      callerAccount ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <HashChip value={callerAccount} trim={0} />
          <ExplorerLink href={`${explorer}/address/${callerAccount}`} />
        </span>
      ) : pkOwner ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <HashChip value={`${pkOwner}#${attestation.payment_key_nonce ?? ''}`} trim={0} />
          <ExplorerLink href={`${explorer}/address/${pkOwner}`} />
        </span>
      ) : null,
      'The NEAR account (or payment key) that requested this execution',
    ],
    [
      'Project',
      attestation.project_id || job?.project_id ? (
        <HashChip value={(attestation.project_id || job?.project_id)!} trim={0} />
      ) : null,
    ],
    [
      'Secrets profile',
      attestation.secrets_ref ? <HashChip value={attestation.secrets_ref} trim={0} /> : null,
    ],
    [
      'Executed at',
      attestation.timestamp
        ? new Date(attestation.timestamp * 1000).toLocaleString()
        : job?.created_at
          ? new Date(job.created_at).toLocaleString()
          : null,
    ],
  ]);

  add('Code', [
    [
      'Source',
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
    ],
    ['Build target', attestation.build_target || null],
    [
      'WASM hash',
      attestation.wasm_hash ? <ResponsiveHash value={attestation.wasm_hash} /> : null,
      'SHA-256 of the exact WebAssembly binary that executed',
    ],
    [
      'Input hash',
      attestation.input_hash ? <ResponsiveHash value={attestation.input_hash} /> : null,
      'SHA-256 of the input the code received',
    ],
    [
      'Output hash',
      attestation.output_hash ? <ResponsiveHash value={attestation.output_hash} /> : null,
      'SHA-256 of the output the code produced',
    ],
  ]);

  add('Infrastructure', [
    [
      'Worker',
      job?.worker_id ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <HashChip value={job.worker_id} trim={0} className="break-all" />
          {workerVerifyUrl && (
            <a
              href={workerVerifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap text-accent-text hover:underline"
            >
              Verify this worker ↗
            </a>
          )}
        </span>
      ) : null,
      'The TEE worker (network-type-version) that ran this job',
    ],
    [
      'Enclave measurement',
      attestation.worker_measurement ? (
        <>
          <HashChip value={attestation.worker_measurement} trim={56} className="hidden sm:inline-flex" />
          <HashChip value={attestation.worker_measurement} className="sm:hidden" />
        </>
      ) : null,
      'TDX measurement of the worker build, approved on-chain',
    ],
  ]);

  add('Cost & timing', [
    [
      'Execution time',
      job?.execution_time_ms != null ? (
        <span className="tabular-nums">{job.execution_time_ms.toLocaleString('en-US')} ms</span>
      ) : null,
    ],
    [
      'Compile time',
      job?.compile_time_ms != null ? (
        <span className="tabular-nums">{job.compile_time_ms.toLocaleString('en-US')} ms</span>
      ) : null,
    ],
    [
      'Instructions',
      job?.instructions_used != null ? (
        <span className="tabular-nums">{job.instructions_used.toLocaleString('en-US')}</span>
      ) : null,
      'WASM instructions metered inside the enclave — billing is based on these',
    ],
    ['Payment', paymentDisplay ? <span className="tabular-nums">{paymentDisplay}</span> : null,
      'Same figure as the Payment column on the Executions page'],
    [
      'Attached deposit',
      attachedUsd ? <span className="tabular-nums">{attachedUsd}</span> : null,
      'USD attached to the call — paid out to the project owner',
    ],
  ]);

  add('On-chain trail', [
    [
      'Request transaction',
      requestTx ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <ResponsiveHash value={requestTx} />
          <ExplorerLink href={`${explorer}/txns/${requestTx}`} />
        </span>
      ) : null,
    ],
    [
      'Result transaction',
      job?.resolve_tx_id ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <ResponsiveHash value={job.resolve_tx_id} />
          <ExplorerLink href={`${explorer}/txns/${job.resolve_tx_id}`} />
        </span>
      ) : null,
      'The resolve_execution call that returned the result on-chain',
    ],
    ['Call id', attestation.call_id ? <ResponsiveHash value={attestation.call_id} /> : null],
    [
      'Block height',
      attestation.block_height ? <HashChip value={String(attestation.block_height)} trim={0} /> : null,
    ],
  ]);

  return (
    <div className="mt-6 rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Execution details</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Everything recorded about this run — the hashes below are the same ones bound into the
        enclave-signed quote.
      </p>
      {groups.map((g) => (
        <div key={g.title} className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">
            {g.title}
          </p>
          <table className="mt-1 w-full text-xs">
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.label} className="border-b border-border last:border-0">
                  <td className="h-9 w-44 py-1.5 pr-3 align-middle text-muted-foreground" title={r.title}>
                    {r.label}
                  </td>
                  <td className="h-9 py-1.5 align-middle">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="mt-4 rounded-md border border-border bg-card-muted p-3">
        <p className="text-xs font-semibold text-foreground">Verify this yourself</p>
        <p className="mt-1 text-xs text-muted-foreground">
          The same checks run as an open-source binary on your machine — no account, no trust in
          this page:
        </p>
        <code className="mt-2 block w-fit max-w-full overflow-x-auto rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-foreground">
          outlayer-verify job {attestation.task_id} --network {network}
        </code>
        <Link
          href="/docs/trust-verification#outlayer-verify"
          className="mt-2 inline-block text-xs font-semibold text-accent-text hover:underline"
        >
          OutLayer Verify docs →
        </Link>
      </div>
    </div>
  );
}
