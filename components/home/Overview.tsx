'use client';

import { PageHeader } from '@/components/ui/page-header';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { fetchWorkers, fetchJobs, getCoordinatorApiUrl } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AttestationBadge } from '@/components/ui/attestation-badge';
import { HashChip } from '@/components/ui/hash-chip';
import { CodeBlock } from '@/components/ui/code-block';
import PendingApprovalsBadge from '@/components/PendingApprovalsBadge';
import DepositUsdcModal from '@/components/home/DepositUsdcModal';

interface UserSecret {
  accessor: Record<string, unknown>;
  profile: string;
  created_at: number;
}

function formatUsd(minimalUnits: string, decimals: number = 6): string {
  const num = BigInt(minimalUnits || '0');
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `$${whole}.${fractionStr}`;
}

const FIRST_CALL_SNIPPET = `curl -X POST https://api.outlayer.ai/call/{owner}/{project} \\
  -H 'X-Payment-Key: {owner}:{nonce}:{secret}' \\
  -d '{"input": "..."}'
# executes in an Intel TDX enclave, returns an attested result`;

function MetricCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href: string;
  hint?: string;
}) {
  return (
    <Link href={href}>
      <Card className="h-full transition-colors hover:border-border-strong">
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-faint-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

function StepIcon({ done }: { done: boolean | null }) {
  if (done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success-text">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3">
          <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  return <span className="h-5 w-5 shrink-0 rounded-full border-2 border-border-strong" />;
}

export default function Overview() {
  const { accountId, contractId, viewMethod, network } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [secretsCount, setSecretsCount] = useState<number | null>(null);
  const [paymentKeysCount, setPaymentKeysCount] = useState<number | null>(null);
  const [walletsCount, setWalletsCount] = useState<number | null>(null);
  const [hasExecuted, setHasExecuted] = useState<boolean | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [earningsBalance, setEarningsBalance] = useState<string | null>(null);
  const [workersCount, setWorkersCount] = useState<number | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;

    viewMethod({ contractId, method: 'list_user_projects', args: { account_id: accountId } })
      .then((projects) => setProjectCount(Array.isArray(projects) ? projects.length : 0))
      .catch(() => setProjectCount(0));

    viewMethod({ contractId, method: 'list_user_secrets', args: { account_id: accountId } })
      .then((secrets) => {
        let secretsOnly = 0;
        let paymentKeys = 0;
        ((secrets as UserSecret[]) || []).forEach((s) => {
          if (s.accessor && typeof s.accessor === 'object' && 'System' in s.accessor) {
            if ((s.accessor as { System: unknown }).System === 'PaymentKey') {
              paymentKeys++;
              return;
            }
          }
          secretsOnly++;
        });
        setSecretsCount(secretsOnly);
        setPaymentKeysCount(paymentKeys);
      })
      .catch(() => {
        setSecretsCount(0);
        setPaymentKeysCount(0);
      });

    viewMethod({
      contractId,
      method: 'get_wallet_policies_by_owner',
      args: { owner: accountId },
    })
      .then((wallets) => setWalletsCount(Array.isArray(wallets) ? wallets.length : 0))
      .catch(() => setWalletsCount(0));

    viewMethod({
      contractId,
      method: 'get_user_stablecoin_balance',
      args: { account_id: accountId },
    })
      .then((balance) =>
        setUsdcBalance(
          typeof balance === 'string'
            ? balance
            : (balance as { toString: () => string })?.toString() || '0',
        ),
      )
      .catch(() => setUsdcBalance('0'));

    fetchJobs(1, 0, accountId)
      .then((jobs) => setHasExecuted(jobs.length > 0))
      .catch(() => setHasExecuted(null));

    fetch(`${coordinatorUrl}/public/project-earnings/${accountId}`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setEarningsBalance(data?.balance ?? '0');
      })
      .catch(() => {});

    fetchWorkers()
      .then((w) => setWorkersCount(w.length))
      .catch(() => {});
  }, [accountId, contractId, viewMethod, coordinatorUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const dash = (v: number | null) => (v === null ? '—' : String(v));

  const steps: Array<{
    label: string;
    sub: string;
    href?: string;
    onClick?: () => void;
    done: boolean | null;
  }> = [
    {
      label: 'Run something in the playground',
      sub: 'Execute an example inside a TDX enclave — no deposit needed on testnet.',
      href: '/playground',
      done: hasExecuted,
    },
    {
      label: 'Create your first project',
      sub: 'A named home for your code with versions and persistent storage.',
      href: '/projects',
      done: projectCount === null ? null : projectCount > 0,
    },
    {
      label: 'Add a payment key',
      sub: 'Prepaid USDC key for calling projects over the HTTPS API.',
      href: '/payment-keys',
      done: paymentKeysCount === null ? null : paymentKeysCount > 0,
    },
    {
      label: 'Deposit USDC',
      sub: 'Funds attached_usd when your contracts or apps call paid projects.',
      onClick: () => setDepositOpen(true),
      done: usdcBalance === null ? null : BigInt(usdcBalance || '0') > BigInt(0),
    },
    {
      label: 'Give an agent a custody wallet',
      sub: 'Policy-guarded multi-chain keys that never leave the enclave.',
      href: '/docs/agent-custody',
      done: walletsCount === null ? null : walletsCount > 0,
    },
  ];
  const doneCount = steps.filter((s) => s.done === true).length;
  const allDone = steps.every((s) => s.done === true);

  return (
    <div className="w-full">
      <PageHeader
        title="Overview"
        description={accountId ? <HashChip value={accountId} trim={0} /> : undefined}
        action={
          workersCount !== null ? (
            <a href="https://workers.outlayer.ai" target="_blank" rel="noreferrer">
              <AttestationBadge label={`${workersCount} workers attested`} />
            </a>
          ) : undefined
        }
      />

      {/* Getting started — hidden once every step is done */}
      {!allDone && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-baseline justify-between space-y-0">
            <CardTitle>Getting started</CardTitle>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {doneCount}/{steps.length}
            </span>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
              {steps.map((step) => {
                const inner = (
                  <span className="flex items-start gap-3">
                    <StepIcon done={step.done} />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm font-semibold ${
                          step.done
                            ? 'text-muted-foreground line-through decoration-border-strong'
                            : 'text-foreground group-hover:text-accent-text'
                        }`}
                      >
                        {step.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">{step.sub}</span>
                    </span>
                  </span>
                );
                return (
                  <li key={step.label}>
                    {step.href ? (
                      <Link href={step.href} className="group block">
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={step.onClick}
                        className="group block text-left cursor-pointer"
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Metrics */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Projects"
          value={dash(projectCount)}
          href="/projects"
          hint={projectCount === 0 ? 'create your first →' : undefined}
        />
        <MetricCard
          label="Secrets"
          value={dash(secretsCount)}
          href="/secrets"
          hint={secretsCount === 0 ? 'store an API key →' : undefined}
        />
        <MetricCard
          label="Payment keys"
          value={dash(paymentKeysCount)}
          href="/payment-keys"
          hint={paymentKeysCount === 0 ? 'enable HTTPS calls →' : undefined}
        />
        <button type="button" onClick={() => setDepositOpen(true)} className="text-left cursor-pointer">
          <Card className="h-full transition-colors hover:border-border-strong">
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">USDC balance</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                {usdcBalance === null ? '—' : formatUsd(usdcBalance)}
              </p>
              <p className="mt-1 text-xs font-semibold text-accent-text">deposit →</p>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* First call + approvals/earnings */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Make your first call</CardTitle>
            <CardDescription>
              Any HTTP client works — the result comes back signed by the enclave.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBlock code={FIRST_CALL_SNIPPET} language="bash" filename="curl" />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/docs/https-api" className="text-sm font-semibold text-accent-text hover:underline">
                HTTPS API reference →
              </Link>
              <Link href="/docs/near-integration" className="text-sm font-semibold text-accent-text hover:underline">
                Call from a NEAR contract →
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                Pending approvals
                <PendingApprovalsBadge />
              </CardTitle>
              <CardDescription>Multisig requests waiting for your signature.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/wallet/approvals" className="text-sm font-semibold text-accent-text hover:underline">
                Review approvals →
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Earnings</CardTitle>
              <CardDescription>
                {earningsBalance === null
                  ? 'Your balance from project calls.'
                  : `Balance: ${formatUsd(earningsBalance)}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/earnings" className="text-sm font-semibold text-accent-text hover:underline">
                View earnings →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Explore */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Link href="/docs/examples" className="group">
          <Card className="h-full transition-colors hover:border-border-strong">
            <CardContent className="p-5">
              <p className="text-sm font-semibold group-hover:text-accent-text">Example agents</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Oracles, VRF, AI inference, Intents swaps — runnable code to fork.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/docs/agent-custody" className="group">
          <Card className="h-full transition-colors hover:border-border-strong">
            <CardContent className="p-5">
              <p className="text-sm font-semibold group-hover:text-accent-text">Agent custody</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Wallets your agents can use but never leak, with policies and multisig.
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/docs/trust-verification" className="group">
          <Card className="h-full transition-colors hover:border-border-strong">
            <CardContent className="p-5">
              <p className="text-sm font-semibold group-hover:text-accent-text">Verify everything</p>
              <p className="mt-1 text-xs text-muted-foreground">
                How TDX quotes, measurements and on-chain approvals fit together.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <DepositUsdcModal open={depositOpen} onClose={() => setDepositOpen(false)} onSuccess={load} />
    </div>
  );
}
