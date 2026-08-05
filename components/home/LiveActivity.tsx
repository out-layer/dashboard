'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  fetchStats,
  fetchWalletStats,
  fetchExecutionsPerDay,
  WalletStats,
  ExecutionsPerDayEntry,
  NetworkType,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart } from '@/components/ui/area-chart';

type SeriesKey = 'executions' | 'wallets' | 'transactions' | 'registrations';

interface DayPoint {
  date: string;
  count: number;
}

/** Running total ending at today's known lifetime total. */
function cumulativeAnchored(days: DayPoint[], total: number) {
  const out = new Array<{ date: string; value: number }>(days.length);
  let running = total;
  for (let i = days.length - 1; i >= 0; i--) {
    out[i] = { date: days[i].date, value: running };
    running -= days[i].count;
  }
  return out;
}

/** Running total within the window, starting from its first day. */
function cumulativeWindow(days: DayPoint[]) {
  let sum = 0;
  return days.map((d) => ({ date: d.date, value: (sum += d.count) }));
}

const SERIES_META: Record<SeriesKey, { title: string; unit: string }> = {
  executions: { title: 'Executions — last 30 days', unit: 'executions' },
  wallets: { title: 'Agent wallets — total', unit: 'wallets' },
  transactions: { title: 'Custody transactions — total', unit: 'transactions' },
  registrations: { title: 'Wallet registrations — last 30 days', unit: 'new wallets' },
};

function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={`h-3.5 w-3.5 ${active ? 'text-accent-text' : ''}`}
      aria-hidden="true"
    >
      <path d="M2 13.5V2.5" strokeLinecap="round" />
      <path d="M2 13.5H14" strokeLinecap="round" />
      <path d="M4.5 10.5 7.5 7l2.5 2 3.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Platform activity: one switchable chart (icons on the tiles pick the series)
 * plus the headline numbers. Shared between the anonymous home (mainnet) and
 * the signed-in Overview (the user's current network).
 */
export default function LiveActivity({ network }: { network: NetworkType }) {
  const [executions, setExecutions] = useState<number | null>(null);
  const [walletStats, setWalletStats] = useState<WalletStats | null>(null);
  const [walletStatsFailed, setWalletStatsFailed] = useState(false);
  const [series, setSeries] = useState<SeriesKey>('wallets');
  const [execDays, setExecDays] = useState<ExecutionsPerDayEntry[] | null>(null);
  // Don't yank the chart from under the user: executions becomes the default
  // series when its data arrives, unless a tile was already clicked.
  const userPickedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setWalletStats(null);
    setWalletStatsFailed(false);
    setExecDays(null);
    fetchStats(network)
      .then((s) => !cancelled && setExecutions(s.total_executions))
      .catch(() => {});
    fetchWalletStats(network)
      .then((ws) => !cancelled && setWalletStats(ws))
      .catch(() => !cancelled && setWalletStatsFailed(true));
    // Optional endpoint (ships with a newer coordinator): absent → tile just
    // has no chart icon and the default series stays on wallets.
    fetchExecutionsPerDay(network)
      .then((days) => {
        if (cancelled || !Array.isArray(days) || days.length < 2) return;
        setExecDays(days);
        if (!userPickedRef.current) setSeries('executions');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [network]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
      <Card>
        <CardHeader>
          <CardTitle>{SERIES_META[series].title}</CardTitle>
        </CardHeader>
        <CardContent>
          {series === 'executions' && execDays ? (
            <AreaChart
              key={series}
              data={execDays.map((d) => ({ date: d.date, value: d.count }))}
              unit={SERIES_META[series].unit}
              kind="bar"
            />
          ) : walletStats ? (
            <AreaChart
              key={series}
              data={
                series === 'wallets'
                  ? cumulativeAnchored(walletStats.registrations_per_day, walletStats.wallets.total)
                  : series === 'transactions'
                    ? cumulativeAnchored(walletStats.transactions_per_day, walletStats.transactions.total)
                    : cumulativeWindow(walletStats.registrations_per_day)
              }
              unit={SERIES_META[series].unit}
              showPoints
              baseline="auto"
            />
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
        {(
          [
            { label: 'Executions', value: executions, href: '/executions', chart: execDays ? ('executions' as SeriesKey) : null },
            { label: 'Agent wallets', value: walletStats?.wallets.total ?? null, href: '/stats', chart: 'wallets' as SeriesKey },
            { label: 'Custody transactions', value: walletStats?.transactions.total ?? null, href: '/stats', chart: 'transactions' as SeriesKey },
            {
              label: 'Wallet registrations · 30d',
              value: walletStats ? walletStats.registrations_per_day.reduce((n, d) => n + d.count, 0) : null,
              href: '/stats',
              chart: 'registrations' as SeriesKey,
            },
          ] as Array<{ label: string; value: number | null; href: string; chart: SeriesKey | null }>
        ).map((m) => (
          <div
            key={m.label}
            className={`relative rounded-lg border bg-card transition-colors ${
              m.chart && series === m.chart ? 'border-accent' : 'border-border hover:border-border-strong'
            }`}
          >
            <Link href={m.href} className="group block p-4 pr-9">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground group-hover:text-accent-text">
                {m.value === null || m.value === undefined ? '—' : m.value.toLocaleString('en-US')}
              </p>
            </Link>
            {m.chart && (
              <button
                type="button"
                aria-label={`Show ${m.label} chart`}
                title="Show chart"
                onClick={() => {
                  userPickedRef.current = true;
                  setSeries(m.chart!);
                }}
                className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-accent hover:text-accent-text"
              >
                <ChartIcon active={series === m.chart} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
