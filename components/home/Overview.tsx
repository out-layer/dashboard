'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { fetchWorkers, getCoordinatorApiUrl } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AttestationBadge } from '@/components/ui/attestation-badge';
import { HashChip } from '@/components/ui/hash-chip';
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
      <Card className="transition-colors hover:border-border-strong">
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-faint-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Overview() {
  const { accountId, contractId, viewMethod, network } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [secretsCount, setSecretsCount] = useState<number | null>(null);
  const [paymentKeysCount, setPaymentKeysCount] = useState<number | null>(null);
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

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Overview</h1>
          {accountId && (
            <div className="mt-1">
              <HashChip value={accountId} trim={0} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {workersCount !== null && (
            <a href="https://workers.outlayer.ai" target="_blank" rel="noreferrer">
              <AttestationBadge label={`${workersCount} workers attested`} />
            </a>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Projects" value={dash(projectCount)} href="/projects" />
        <MetricCard label="Secrets" value={dash(secretsCount)} href="/secrets" />
        <MetricCard label="Payment keys" value={dash(paymentKeysCount)} href="/payment-keys" />
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

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
              {earningsBalance === null ? 'Your balance from project calls.' : `Balance: ${formatUsd(earningsBalance)}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/earnings" className="text-sm font-semibold text-accent-text hover:underline">
              View earnings →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quickstart</CardTitle>
            <CardDescription>Run something in the enclave right now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <Link href="/playground" className="text-sm font-semibold text-accent-text hover:underline">
              Open playground →
            </Link>
            <Link href="/docs/examples" className="text-sm font-semibold text-accent-text hover:underline">
              Browse examples →
            </Link>
            <Link href="/docs/agent-custody" className="text-sm font-semibold text-accent-text hover:underline">
              Give an agent a wallet →
            </Link>
          </CardContent>
        </Card>
      </div>
      <DepositUsdcModal open={depositOpen} onClose={() => setDepositOpen(false)} onSuccess={load} />
    </div>
  );
}
