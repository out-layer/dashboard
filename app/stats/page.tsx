'use client';

import { PageHeader } from '@/components/ui/page-header';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchStats,
  ExecutionStats,
  fetchPopularRepos,
  PopularRepo,
  fetchPricing,
  PricingConfig,
  fetchWalletStats,
  WalletStats,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart } from '@/components/ui/bar-chart';

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
 <Card className={href ? 'h-full transition-colors hover:border-border-strong' : 'h-full'}>
 <CardContent className="p-5">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
 {sub && <p className="mt-1 text-xs text-faint-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
 return href ? <Link href={href}>{body}</Link> : body;
}

export default function StatsPage() {
  const [stats, setStats] = useState<ExecutionStats | null>(null);
  const [repos, setRepos] = useState<PopularRepo[]>([]);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [walletStats, setWalletStats] = useState<WalletStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [statsData, reposData, pricingData, walletData] = await Promise.all([
        fetchStats(),
        fetchPopularRepos(),
        fetchPricing(),
        fetchWalletStats().catch(() => null),
      ]);
      setStats(statsData);
      setRepos(reposData);
      setPricing(pricingData);
      setWalletStats(walletData);
      setError(null);
    } catch (err) {
      setError('Failed to load statistics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatYoctoNEAR = (yocto: string) => {
    const near = parseFloat(yocto) / 1e24;
    // Use adaptive precision for very small values
    if (near === 0) return '0 NEAR';
    if (near < 0.000001) return near.toFixed(12) + ' NEAR';
    if (near < 0.001) return near.toFixed(9) + ' NEAR';
    return near.toFixed(6) + ' NEAR';
  };

  // Format USD from minimal units (6 decimals for USDC/USDT)
  const formatUsdMinimal = (units: string) => {
    const usd = parseFloat(units) / 1e6;
    if (usd === 0) return '$0';
    if (usd < 0.000001) return '$' + usd.toFixed(9);
    if (usd < 0.001) return '$' + usd.toFixed(6);
    return '$' + usd.toFixed(4);
  };

  const formatInstructions = (instructions: number) => {
    if (instructions > 1e12) return (instructions / 1e12).toFixed(2) + 'T';
    if (instructions > 1e9) return (instructions / 1e9).toFixed(2) + 'B';
    if (instructions > 1e6) return (instructions / 1e6).toFixed(2) + 'M';
    if (instructions > 1e3) return (instructions / 1e3).toFixed(2) + 'K';
    return instructions.toString();
  };

  if (loading) {
    return (
 <div className="flex min-h-[400px] items-center justify-center">
 <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-accent" />
      </div>
    );
  }

  if (error || !stats) {
    return (
 <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
 <p className="text-sm text-destructive-text">{error}</p>
      </div>
    );
  }

  // Platform success rate = requests handled without infrastructure errors.
  // We're not at fault if the user has a wrong repo/secrets — only count
  // infrastructure failures against the platform.
  const platformSuccesses = stats.total_executions - stats.failed_executions;
  const successRate =
    stats.total_executions > 0
      ? ((platformSuccesses / stats.total_executions) * 100).toFixed(1)
      : '0';

  const userErrors =
    stats.access_denied_executions +
    stats.compilation_failed_executions +
    stats.execution_failed_executions +
    stats.insufficient_payment_executions +
    stats.custom_executions;

  const outcomeSegments = [
    { label: 'Successful', value: stats.successful_executions, color: 'var(--success)' },
    { label: 'Infrastructure errors', value: stats.failed_executions, color: 'var(--destructive)' },
    { label: 'User-side outcomes', value: userErrors, color: 'var(--faint-foreground)' },
  ].filter((s) => s.value > 0);
  const outcomeTotal = outcomeSegments.reduce((n, s) => n + s.value, 0);

  const outcomeDetail: Array<[string, number]> = [
    ['Successful', stats.successful_executions],
    ['Infrastructure errors', stats.failed_executions],
    ['Access denied', stats.access_denied_executions],
    ['Compilation failed', stats.compilation_failed_executions],
    ['Execution failed', stats.execution_failed_executions],
    ['Insufficient payment', stats.insufficient_payment_executions],
    ['Custom errors', stats.custom_executions],
  ];

  return (
 <div className="w-full">
      <PageHeader
        title="Stats"
        description="Platform-wide metrics, refreshed every 30 seconds."
      />

      {/* KPI tiles */}
 <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total executions" value={stats.total_executions.toLocaleString('en-US')} />
        <Tile
          label="Platform success rate"
          value={`${successRate}%`}
          sub={`${platformSuccesses.toLocaleString('en-US')} handled without infrastructure errors`}
        />
        <Tile label="Active workers" value={String(stats.active_workers)} href="/workers" sub="view fleet →" />
        <Tile label="Unique users" value={stats.unique_users.toLocaleString('en-US')} />
      </div>
 <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Tile label="Instructions executed" value={formatInstructions(stats.total_instructions_used)} />
        <Tile label="Avg execution time" value={`${stats.average_execution_time_ms} ms`} />
        <Tile label="Total NEAR paid" value={formatYoctoNEAR(stats.total_near_paid_yocto)} />
      </div>

      {/* Execution outcomes */}
 <Card className="mt-6">
        <CardHeader>
 <CardTitle>Execution outcomes</CardTitle>
          <CardDescription>
            All {stats.total_executions.toLocaleString('en-US')} executions. The platform rate counts
            only infrastructure errors as failures — user-side outcomes (wrong repo, denied access,
            unpaid calls) are the caller&apos;s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outcomeTotal > 0 && (
 <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full">
              {outcomeSegments.map((s) => (
                <div
                  key={s.label}
                  title={`${s.label}: ${s.value.toLocaleString('en-US')}`}
                  style={{ width: `${(s.value / outcomeTotal) * 100}%`, background: s.color }}
 className="min-w-[3px]"
                />
              ))}
            </div>
          )}
 <div className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {outcomeDetail.map(([label, value], i) => (
 <div key={label} className="flex items-center justify-between gap-3">
 <span className="flex items-center gap-2 text-muted-foreground">
                  <span
 className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background:
                        i === 0
                          ? 'var(--success)'
                          : i === 1
                            ? 'var(--destructive)'
                            : 'var(--faint-foreground)',
                    }}
                  />
                  {label}
                </span>
 <span className="font-semibold tabular-nums">{value.toLocaleString('en-US')}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Popular repositories */}
      {repos.filter((repo) => repo.successful_executions > 0).length > 0 && (
 <Card className="mt-6 overflow-hidden rounded-md">
          <CardHeader>
 <CardTitle>Popular repositories</CardTitle>
          </CardHeader>
 <div className="overflow-x-auto">
 <table className="min-w-full text-sm">
              <thead>
 <tr className="border-t border-border text-left text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">
 <th className="px-5 py-3">Repository</th>
 <th className="px-5 py-3 text-right">Executions</th>
 <th className="px-5 py-3">Success rate</th>
 <th className="px-5 py-3">Last commit</th>
                </tr>
              </thead>
              <tbody>
                {repos
                  .filter((repo) => repo.successful_executions > 0)
                  .map((repo, idx) => {
                    // Compilation failures don't count as executions for repo stats
                    const actualExecutions = repo.total_executions - repo.compilation_failed_executions;
                    const repoPlatformSuccesses = actualExecutions - repo.failed_executions;
                    const repoRate =
                      actualExecutions > 0
                        ? ((repoPlatformSuccesses / actualExecutions) * 100).toFixed(1)
                        : '0';
                    return (
 <tr key={idx} className="border-t border-border hover:bg-card-muted/60">
 <td className="px-5 py-3">
                          <a
                            href={repo.github_repo}
                            target="_blank"
                            rel="noopener noreferrer"
 className="font-medium text-accent-text hover:underline"
                          >
                            {repo.github_repo.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                          </a>
                        </td>
 <td className="px-5 py-3 text-right tabular-nums">{actualExecutions}</td>
 <td className="px-5 py-3">
                          <Badge variant={parseFloat(repoRate) > 90 ? 'success' : 'warning'}>
                            {parseFloat(repoRate) <= 90 && (
 <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                                <path d="M8 1.5 15 14H1zM7.25 6v4h1.5V6zm0 5v1.5h1.5V11z" />
                              </svg>
                            )}
                            {repoRate}%
                          </Badge>
                        </td>
 <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                          {repo.last_commit ? repo.last_commit.substring(0, 8) : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pricing & limits */}
      {pricing && (
 <Card className="mt-6">
          <CardHeader>
 <CardTitle>Pricing &amp; limits</CardTitle>
            <CardDescription>
              Live platform configuration. <Link href="/docs/pricing" className="text-accent-text hover:underline">
                How pricing works →
              </Link>
            </CardDescription>
          </CardHeader>
 <CardContent className="space-y-6">
            <div>
 <h3 className="text-sm font-semibold">NEAR pricing (blockchain transactions)</h3>
 <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
 <dt className="text-muted-foreground">Base fee</dt>
 <dd className="tabular-nums">{formatYoctoNEAR(pricing.base_fee)}</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Per million instructions</dt>
 <dd className="tabular-nums">{formatYoctoNEAR(pricing.per_instruction_fee)}</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Per millisecond (execution)</dt>
 <dd className="tabular-nums">{formatYoctoNEAR(pricing.per_ms_fee)}</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Per millisecond (compilation)</dt>
 <dd className="tabular-nums">{formatYoctoNEAR(pricing.per_compile_ms_fee)}</dd>
                </div>
              </dl>
            </div>
            <div>
 <h3 className="text-sm font-semibold">USD pricing (payment keys)</h3>
 <p className="mt-1 text-xs text-muted-foreground">
                For HTTPS API calls. <Link href="/docs/payment-keys" className="text-accent-text hover:underline">
                  Payment keys →
                </Link>
              </p>
 <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div>
 <dt className="text-muted-foreground">Base fee</dt>
 <dd className="tabular-nums">{formatUsdMinimal(pricing.base_fee_usd)}</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Per million instructions</dt>
 <dd className="tabular-nums">{formatUsdMinimal(pricing.per_instruction_fee_usd)}</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Per second (execution)</dt>
 <dd className="tabular-nums">{formatUsdMinimal(pricing.per_sec_fee_usd)}</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Per millisecond (compilation)</dt>
 <dd className="tabular-nums">{formatUsdMinimal(pricing.per_compile_ms_fee_usd)}</dd>
                </div>
              </dl>
            </div>
            <div>
 <h3 className="text-sm font-semibold">Resource limits</h3>
 <dl className="mt-2 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
 <dt className="text-muted-foreground">Max instructions</dt>
 <dd className="tabular-nums">{formatInstructions(pricing.max_instructions)}</dd>
 <dd className="text-xs text-faint-foreground">hard cap per execution</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Max execution time</dt>
 <dd className="tabular-nums">{pricing.max_execution_seconds} s</dd>
                </div>
                <div>
 <dt className="text-muted-foreground">Max compilation time</dt>
 <dd className="tabular-nums">{pricing.max_compilation_seconds} s</dd>
                </div>
              </dl>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent custody */}
      {walletStats && (
 <div className="mt-6">
 <h2 className="text-sm font-semibold uppercase tracking-wider text-faint-foreground">
            Agent custody
          </h2>
 <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Total wallets" value={walletStats.wallets.total.toLocaleString('en-US')} />
            <Tile label="Active wallets" value={walletStats.wallets.active.toLocaleString('en-US')} />
            <Tile label="Deleted" value={walletStats.wallets.deleted.toLocaleString('en-US')} />
            <Tile
              label="Transactions"
              value={walletStats.transactions.total.toLocaleString('en-US')}
              sub={
                walletStats.pending_approvals > 0
                  ? `${walletStats.pending_approvals} pending approval`
                  : undefined
              }
            />
          </div>

          {Object.keys(walletStats.transactions.by_type).length > 0 && (
 <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(walletStats.transactions.by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
 <Badge key={type} variant="outline" className="gap-1.5">
                    {type.replace(/_/g, ' ')}
 <span className="font-bold tabular-nums text-foreground">{count}</span>
                  </Badge>
                ))}
            </div>
          )}

          {Object.keys(walletStats.transactions.by_status).length > 0 && (
 <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(walletStats.transactions.by_status)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => {
                  const variant =
                    status === 'completed' ? 'success' : status === 'failed' ? 'destructive' : 'warning';
                  return (
 <Badge key={status} variant={variant} className="gap-1.5">
                      {status}
 <span className="font-bold tabular-nums">{count}</span>
                    </Badge>
                  );
                })}
            </div>
          )}

          {(walletStats.registrations_per_day.length > 0 ||
            walletStats.transactions_per_day.length > 0) && (
 <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {walletStats.registrations_per_day.length > 0 && (
                <Card>
                  <CardHeader>
 <CardTitle>Wallet registrations — last 30 days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarChart
                      data={walletStats.registrations_per_day.map((d) => ({
                        label: d.date.slice(5),
                        value: d.count,
                      }))}
                    />
                  </CardContent>
                </Card>
              )}
              {walletStats.transactions_per_day.length > 0 && (
                <Card>
                  <CardHeader>
 <CardTitle>Custody transactions — last 30 days</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarChart
                      data={walletStats.transactions_per_day.map((d) => ({
                        label: d.date.slice(5),
                        value: d.count,
                      }))}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
