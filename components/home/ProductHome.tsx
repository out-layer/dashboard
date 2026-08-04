'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useNearWallet } from '@/contexts/NearWalletContext';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { fetchStats, fetchWorkers } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { AttestationBadge } from '@/components/ui/attestation-badge';

const COMPUTE_SNIPPET = `curl -X POST https://api.outlayer.ai/call/{owner}/{project} \\
  -H 'X-Payment-Key: {owner}:{nonce}:{secret}' \\
  -d '{"input": "..."}'
# runs your WASI code in an Intel TDX enclave,
# returns the result signed by the enclave`;

const CUSTODY_SNIPPET = `curl 'https://api.outlayer.ai/wallet/v1/address?chain=near' \\
  -H 'Authorization: Bearer wk_...'
# the agent gets NEAR / EVM / Solana addresses;
# keys never exist outside the TEE, policies enforced inside`;

const PAYMENTS_SNIPPET = `# usage is metered in USD per call
# developers earn on every call to their project
# balances and withdrawals: /earnings`;

export default function ProductHome() {
  const { isConnected } = useNearWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [executions, setExecutions] = useState<number | null>(null);
  const [workersAttested, setWorkersAttested] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStats()
      .then((s) => !cancelled && setExecutions(s.total_executions))
      .catch(() => {});
    fetchWorkers()
      .then((w) => !cancelled && setWorkersAttested(w.length))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero */}
      <div className="py-10 sm:py-14">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
          Verifiable compute and custody for AI agents.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Agents run inside Intel TDX enclaves, hold policy-guarded wallets for NEAR, EVM and
          Solana, and leave cryptographic receipts on-chain for every action. Secrets stay
          encrypted; nobody — including the operator — can tamper with what runs.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!isConnected && <Button onClick={() => setModalOpen(true)}>Connect wallet</Button>}
          <Link href="/playground">
            <Button variant="outline">Try playground</Button>
          </Link>
          <Link href="/docs/getting-started">
            <Button variant="ghost">Read docs</Button>
          </Link>
        </div>
      </div>

      {/* Live strip — real numbers, not claims */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-5 py-3 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold">
          <span className="h-2 w-2 rounded-full bg-success" />
          Live on NEAR mainnet
        </span>
        <Link href="/workers" className="text-muted-foreground hover:text-accent-text">
          <span className="font-semibold tabular-nums text-foreground">
            {workersAttested ?? '—'}
          </span>{' '}
          workers attested
        </Link>
        <Link href="/stats" className="text-muted-foreground hover:text-accent-text">
          <span className="font-semibold tabular-nums text-foreground">
            {executions === null ? '—' : executions.toLocaleString('en-US')}
          </span>{' '}
          executions
        </Link>
        <a
          href="https://workers.outlayer.ai"
          className="ml-auto inline-flex"
          target="_blank"
          rel="noreferrer"
        >
          <AttestationBadge label="Verify the fleet" />
        </a>
      </div>

      {/* Pillars */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Compute</CardTitle>
            <CardDescription>Run any code with proof it ran unmodified.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={COMPUTE_SNIPPET} language="bash" filename="curl" />
            <Link href="/docs/web2-integration" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">
              Web2 integration →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Custody</CardTitle>
            <CardDescription>Wallets agents can use but never leak.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={CUSTODY_SNIPPET} language="bash" filename="curl" />
            <Link href="/docs/agent-custody" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">
              Agent custody →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            <CardDescription>Metered in USD. Developers earn per call.</CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={PAYMENTS_SNIPPET} language="bash" filename="pricing" />
            <Link href="/docs/earnings" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">
              Earnings →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* How verification works */}
      <div className="mt-8 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">How verification works</h2>
        <div className="mt-3 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
          <div>
            <span className="font-mono text-xs text-faint-foreground">01</span>
            <p className="mt-1">
              Every worker boots in an Intel TDX enclave and produces a hardware attestation quote.
            </p>
          </div>
          <div>
            <span className="font-mono text-xs text-faint-foreground">02</span>
            <p className="mt-1">
              The quote is DCAP-verified against Intel PCS; the measurement is approved on-chain.
            </p>
          </div>
          <div>
            <span className="font-mono text-xs text-faint-foreground">03</span>
            <p className="mt-1">
              Each execution returns an enclave-signed receipt you can check on its attestation
              page.
            </p>
          </div>
        </div>
        <Link
          href="/docs/trust-verification"
          className="mt-4 inline-block text-sm font-semibold text-accent-text hover:underline"
        >
          Trust &amp; verification →
        </Link>
      </div>

      <WalletConnectionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
