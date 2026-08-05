'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useNearWallet } from '@/contexts/NearWalletContext';
import WalletConnectionModal from '@/components/WalletConnectionModal';
import { fetchStats, fetchWorkers, fetchWalletStats, WalletStats } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AttestationBadge } from '@/components/ui/attestation-badge';
import { AreaChart } from '@/components/ui/area-chart';

/** Examples shown as a gallery — playground presets open pre-filled. */
const EXAMPLES: Array<{ label: string; href: string; desc: string }> = [
  { label: 'AI Completions', href: '/playground?preset=AI%20Completions', desc: 'attested LLM answers' },
  { label: 'Weather oracle', href: '/playground?preset=Weather%20Data%20Oracle', desc: 'real-world data on-chain' },
  { label: 'Ethereum state proof', href: '/playground?preset=Ethereum%20State%20Proof', desc: 'Merkle proofs verified in TEE' },
  { label: 'VRF coin flip', href: '/playground?preset=VRF%20Coin%20Flip', desc: 'provable randomness' },
  { label: 'Intents swap', href: '/playground?preset=NEAR%20Intents%20Swap', desc: 'cross-chain swaps' },
  { label: 'Random number', href: '/playground?preset=Random%20Number%20Generator', desc: 'verifiable RNG' },
  { label: 'Price oracle', href: '/docs/examples#oracle-ark', desc: 'multi-source median' },
  { label: 'NEAR Email', href: '/docs/examples#near-email', desc: 'mail ↔ chain bridge' },
  { label: 'Private DAO voting', href: '/docs/examples#private-dao-ark', desc: 'tally without exposure' },
  { label: '2FA verification', href: '/docs/examples#captcha-ark', desc: 'human checks for agents' },
];

export default function ProductHome() {
  const { isConnected } = useNearWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [executions, setExecutions] = useState<number | null>(null);
  const [uniqueUsers, setUniqueUsers] = useState<number | null>(null);
  const [workersAttested, setWorkersAttested] = useState<number | null>(null);
  const [walletStats, setWalletStats] = useState<WalletStats | null>(null);
  const [walletStatsFailed, setWalletStatsFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStats()
      .then((s) => {
        if (cancelled) return;
        setExecutions(s.total_executions);
        setUniqueUsers(s.unique_users);
      })
      .catch(() => {});
    fetchWorkers()
      .then((w) => !cancelled && setWorkersAttested(w.length))
      .catch(() => {});
    fetchWalletStats()
      .then((ws) => !cancelled && setWalletStats(ws))
      .catch(() => !cancelled && setWalletStatsFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Hero — the layer mark, scaled up */}
      <div className="py-10 sm:py-14">
        <div className="group relative w-fit pl-6">
          <span
            aria-hidden="true"
            className="absolute bottom-1 left-0 top-[14px] w-[4px] rounded-full bg-border-strong transition-transform duration-300 ease-in-out motion-reduce:transition-none group-hover:translate-x-[9px] group-hover:-translate-y-[9px]"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-[14px] left-[9px] top-1 w-[4px] rounded-full bg-gradient-to-b from-accent to-accent/40 transition-transform duration-300 ease-in-out motion-reduce:transition-none group-hover:-translate-x-[9px] group-hover:translate-y-[9px]"
          />
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
            Verifiable compute and custody for AI agents.
          </h1>
        </div>
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

      {/* Live activity: real numbers + real chart, not claims */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <Card>
          <CardHeader className="flex-row items-baseline justify-between space-y-0">
            <CardTitle>Custody transactions — last 30 days</CardTitle>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success" />
              Live on NEAR mainnet
            </span>
          </CardHeader>
          <CardContent>
            {walletStats ? (
              <AreaChart data={walletStats.transactions_per_day.map((d) => ({ date: d.date, value: d.count }))} unit="transactions" />
            ) : walletStatsFailed ? (
              <div className="flex h-[215px] items-center">
                <span className="text-sm text-muted-foreground">Live data unavailable right now.</span>
              </div>
            ) : (
              <div className="flex h-[215px] items-center gap-3">
                <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-b-2 border-accent" aria-hidden="true" />
                <span className="text-sm text-muted-foreground">Loading…</span>
              </div>
            )}
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          {[
            { label: 'Executions', value: executions, href: '/stats' },
            { label: 'Agent wallets', value: walletStats?.wallets.total ?? null, href: '/stats' },
            { label: 'Workers attested', value: workersAttested, href: '/workers' },
            { label: 'Unique users', value: uniqueUsers, href: '/stats' },
          ].map((m) => (
            <Link key={m.label} href={m.href} className="group">
              <div className="h-full rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground group-hover:text-accent-text">
                  {m.value === null || m.value === undefined ? '—' : m.value.toLocaleString('en-US')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Example gallery — the breadth, not code */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold">What people run on OutLayer</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every example opens ready to run — no project, key or code required.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {EXAMPLES.map((ex) => (
            <Link
              key={ex.label}
              href={ex.href}
              className="group rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-accent"
            >
              <span className="block text-sm font-medium text-foreground group-hover:text-accent-text">
                {ex.label}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{ex.desc}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Three audiences */}
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>If you use an AI agent</CardTitle>
            <CardDescription>
              Give it a wallet it can spend but never leak — no code involved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>
                Drop the{' '}
                <a
                  href="https://skills.outlayer.ai/agent-custody/SKILL.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent-text hover:underline"
                >
                  agent-custody skill
                </a>{' '}
                into Claude, Cursor or your own agent
              </li>
              <li>It mints NEAR, EVM and Solana addresses backed by the TEE</li>
              <li>Your policy caps spending; large transfers wait for your approval</li>
              <li>Every signature lands in an audit log you can open anytime</li>
            </ul>
            <Link href="/docs/agent-custody" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">
              Agent custody →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>If you build</CardTitle>
            <CardDescription>
              One platform, many entry points — pick the one your stack speaks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {[
                { label: 'Call from a NEAR contract (yield/resume)', href: '/docs/near-integration' },
                { label: 'HTTPS API with prepaid keys', href: '/docs/https-api' },
                { label: 'TypeScript SDK', href: '/docs/sdk' },
                { label: 'Encrypted secrets in your code', href: '/docs/secrets' },
                { label: 'Projects, versions and storage', href: '/docs/projects' },
                { label: 'VRF and randomness', href: '/docs/vrf' },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-accent-text hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/docs/getting-started" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">
              Getting started →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>If you sign off on risk</CardTitle>
            <CardDescription>
              Trust is verified, not promised — check every layer yourself.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li>Intel TDX enclaves, DCAP-verified against Intel PCS</li>
              <li>Enclave measurements approved on-chain by a DAO</li>
              <li>Keys derived via NEAR MPC — leave with your vault anytime</li>
              <li>Open source, with a public attestation portal for the fleet</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/docs/trust-verification" className="text-sm font-semibold text-accent-text hover:underline">
                Trust &amp; verification →
              </Link>
              <a
                href="https://workers.outlayer.ai"
                target="_blank"
                rel="noreferrer"
                className="inline-flex"
              >
                <AttestationBadge label="Verify the fleet" />
              </a>
            </div>
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
