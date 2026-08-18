'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { actionCreators } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { InfoHint } from '@/components/ui/info-hint';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { getAllWalletKeys } from '@/lib/wallet-keys';

/**
 * Buy a subscription, and see when it starts and how long it lasts.
 *
 * **Only an agent's key can be subscribed here, and that is deliberate.**
 *
 * A subscription is not a special kind of key — the contract and the
 * coordinator will happily put one on any payment key, and the HTTPS purchase
 * endpoint accepts one. What that buys, though, is a second budget on a second
 * key: nothing merges them, nothing warns, and a person with two subscribed
 * keys pays twice for one agent's worth of work. So this page offers the one
 * shape that cannot be got wrong — the wallet's `wk_`, which names exactly one
 * key, because a wallet has exactly one agent key.
 *
 * An agent's key has no string at all: it is named after the wallet and the
 * coordinator resolves it from the `wk_`. Which is why the purchase happens ON
 * CHAIN, by naming owner and nonce in an `ft_transfer_call` — there is nothing
 * to paste, copy or keep safe.
 */

interface Plan {
  index: number;
  name: string;
  price_usd: string;
  active: boolean;
}

interface SubscriptionStatus {
  owner: string;
  nonce: number;
  is_agent: boolean;
  has_subscription: boolean;
  expires_at: string | null;
  accepting_calls_until: string | null;
  allowance_total_usd: string;
  allowance_spent_usd: string;
  allowance_available_usd: string;
  balance: string;
  expired: boolean;
}

/** Stablecoin minimal units (6 decimals) as dollars. */
function usd(minimal: string | null | undefined): string {
  if (!minimal) return '$0.00';
  const n = BigInt(minimal);
  const whole = n / BigInt(1_000_000);
  const cents = (n % BigInt(1_000_000)) / BigInt(10_000);
  return `$${whole}.${cents.toString().padStart(2, '0')}`;
}

function when(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionPageContent />
    </Suspense>
  );
}

function SubscriptionPageContent() {
  const { network, contractId, viewMethod, isConnected, signAndSendTransaction, stablecoin } =
    useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const searchParams = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [savedKeys, setSavedKeys] = useState<Record<string, { apiKey: string; label?: string }>>({});
  const [selectedWallet, setSelectedWallet] = useState('');
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  /**
   * What the allowance was before the payment.
   *
   * An on-chain purchase answers with a transaction, not with a receipt: the
   * allowance is granted by the coordinator against the contract's event, a
   * moment later. So the confirmation is the DIFFERENCE between what the key
   * carried before and what it carries now — two figures the coordinator
   * stated, rather than a number this page assumed.
   */
  const [before, setBefore] = useState<SubscriptionStatus | null>(null);

  // The "before" reading belongs to ONE key. Switching agents must forget it:
  // comparing this agent's allowance against the last one's would announce a
  // credit that never happened — and, when the new one holds less, print a
  // negative sum as if money had arrived.
  useEffect(() => {
    setBefore(null);
    setNotice(null);
  }, [selectedWallet]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The wallets page links here with the agent already chosen — that is where
  // its `wk_` is kept, and once it is known this page has nothing to ask for.
  useEffect(() => {
    const keys = getAllWalletKeys();
    setSavedKeys(keys);
    const asked = searchParams.get('wallet');
    const first = asked && keys[asked] ? asked : Object.keys(keys)[0];
    if (first) setSelectedWallet(first);
  }, [searchParams]);

  // The catalogue is on chain, so it loads for anyone — no key, no wallet.
  useEffect(() => {
    let cancelled = false;
    viewMethod({ contractId, method: 'get_subscription_plans' })
      .then((r) => {
        if (!cancelled) setPlans(((r as Plan[]) || []).filter((p) => p.active));
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contractId, viewMethod]);

  const agentKey = selectedWallet ? savedKeys[selectedWallet]?.apiKey ?? '' : '';

  /**
   * What this credential carries.
   *
   * The agent path authenticates with the `wk_`, which the coordinator accepts
   * for READS — and the answer carries the owner and nonce that the on-chain
   * purchase has to name, so nothing else has to know them.
   */
  const loadStatus = useCallback(async () => {
    if (!agentKey) {
      setStatus(null);
      return;
    }
    const headers = { Authorization: `Bearer ${agentKey}` };

    setError(null);
    try {
      const resp = await fetch(`${coordinatorUrl}/subscription/status`, { headers });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Could not read the subscription (HTTP ${resp.status}): ${body}`);
      }
      setStatus((await resp.json()) as SubscriptionStatus);
    } catch (err) {
      setStatus(null);
      setError((err as Error).message);
    }
  }, [coordinatorUrl, agentKey]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /**
   * An agent's subscription is bought ON CHAIN.
   *
   * `buy_subscription` names the key by owner and nonce, so no key string is
   * involved anywhere — which is the whole reason an agent key has none. The
   * money is revenue on arrival rather than the key's balance, and the
   * coordinator grants the allowance against the event the contract emits, so
   * it appears a moment after the transaction rather than inside it.
   */
  const buyForAgent = async (plan: Plan) => {
    setError(null);
    setNotice(null);
    if (!isConnected) {
      setError('Connect your NEAR wallet — it sends the payment.');
      return;
    }
    if (!status) {
      setError('Choose an agent whose key this browser knows.');
      return;
    }

    setBusy(true);
    setBefore(status);
    try {
      const action = actionCreators.functionCall(
        'ft_transfer_call',
        {
          receiver_id: contractId,
          amount: plan.price_usd,
          msg: JSON.stringify({
            action: 'buy_subscription',
            nonce: status.nonce,
            // Spelled out rather than left to default to the sender: the
            // subscription belongs to the AGENT, and the sender is you.
            owner: status.owner,
            plan: plan.index,
          }),
        },
        BigInt('100000000000000'), // 100 TGas
        BigInt('1'), // 1 yoctoNEAR
      );

      await signAndSendTransaction({
        receiverId: stablecoin.contract,
        actions: [action],
        callbackUrl: window.location.href.split('?')[0],
      });

      setNotice(
        'Payment sent. The allowance is granted against the on-chain event, so it lands here a moment later — use Refresh if it has not appeared yet.',
      );
      setTimeout(loadStatus, 4000);
    } catch (err) {
      setError(`The payment did not go through: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const walletOptions = Object.entries(savedKeys);
  const canBuy = Boolean(status) && isConnected;

  return (
 <div className="w-full">
 <PageHeader
        title="Subscription"
        description="A flat rate that covers the calls a key makes to OutLayer's curated connectors, for as long as the plan runs."
      />

 <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
 <div className="space-y-6">
 <section className="rounded-lg border border-border bg-card p-5">
 <h2 className="text-lg font-semibold text-foreground">What a subscription is</h2>
 <div className="mt-2 space-y-3 text-sm text-muted-foreground">
 <p>
                Without one, every call is paid for out of the key&apos;s balance: the compute it
                uses, plus the connector&apos;s own price. With one, those calls come out of an
                ALLOWANCE instead — one rate for the period the plan runs, no per-call arithmetic,
                and nothing to top up between calls.
 </p>
 <p>
                The allowance belongs to a KEY, not to an account, and it is spent before any
                balance that key also holds. What is left when the period ends does not carry over.
 </p>
 <p>
                Buying more never shortens what is already paid for: validity extends from
                whichever is later, today or the current expiry. Paying above a plan&apos;s price
                leaves the difference as spendable balance rather than absorbing it.
 </p>
 </div>
 </section>

 <section className="rounded-lg border border-border bg-card p-5">
 <h2 className="text-lg font-semibold text-foreground">
              Whose subscription
 <InfoHint
                className="ml-2"
                text={
 <>
                    An agent&apos;s payment key has no key string: it is named after the wallet,
                    and the coordinator resolves it from the <code>wk_</code> the agent presents.
                    That is why an agent&apos;s subscription is paid for on chain, by naming the
                    key — and why there is nothing here to copy or keep safe.
 </>
                }
              />
 </h2>

 <div className="mt-4">
                {walletOptions.length === 0 ? (
 <p className="text-sm text-muted-foreground">
                    This browser knows no agent keys. Save one on the{' '}
 <Link className="text-accent-text underline" href="/wallet/manage">
                      wallets
 </Link>{' '}
                    page — the <em>subscription</em> link beside a saved key brings you back here
                    with that agent already chosen.
 </p>
                ) : (
 <label className="block">
 <span className="text-sm font-medium text-foreground">Agent</span>
 <select
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                      value={selectedWallet}
                      onChange={(e) => setSelectedWallet(e.target.value)}
                    >
                      {walletOptions.map(([pubkey, entry]) => (
 <option key={pubkey} value={pubkey}>
                          {entry.label ? `${entry.label} — ` : ''}
                          {pubkey.substring(0, 26)}…
 </option>
                      ))}
 </select>
 <span className="mt-1 block text-xs text-muted-foreground">
                      Its <code>wk_</code> stays in this browser, and its payment key has no string
                      to lose.
 </span>
 </label>
                )}
 </div>
 </section>

 <section className="rounded-lg border border-border bg-card p-5">
 <h2 className="text-lg font-semibold text-foreground">Pay</h2>
 <p className="mt-2 text-sm text-muted-foreground">
              One transaction from your wallet, in stablecoin, naming the agent&apos;s key. You
              pay; the agent is what carries the allowance — it needs no NEAR and no balance of its
              own for this.
 </p>

            {plans.length === 0 ? (
 <p className="mt-4 text-sm text-muted-foreground">No plan is on sale on this network yet.</p>
            ) : (
 <ul className="mt-4 space-y-3">
                {plans.map((plan) => (
 <li
                    key={plan.index}
 className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-4 py-3"
                  >
 <div>
 <div className="font-medium text-foreground">{plan.name}</div>
 <div className="text-sm text-muted-foreground">{usd(plan.price_usd)} per period</div>
 </div>
 <button
                      onClick={() => buyForAgent(plan)}
                      disabled={busy || !canBuy}
 className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busy ? 'Working…' : 'Buy'}
 </button>
 </li>
                ))}
 </ul>
            )}
 </section>
 </div>

 <div className="space-y-6">
 <section className="rounded-lg border border-border bg-card p-5">
 <h2 className="text-lg font-semibold text-foreground">What this key carries</h2>

            {error && (
 <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
                {error}
 </div>
            )}
            {notice && (
 <div className="mt-3 rounded-md border border-accent/30 bg-accent/10 p-3 text-sm">
                {notice}
 </div>
            )}
            {/* Landed only when the coordinator has actually credited the
                allowance — the figures are its, and the difference is what
                proves the payment arrived rather than merely being sent. */}
            {before &&
              status &&
              // Same key, and MORE than before. Anything else is not a receipt.
              before.owner === status.owner &&
              before.nonce === status.nonce &&
              BigInt(status.allowance_total_usd) > BigInt(before.allowance_total_usd) && (
 <div className="mt-3 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success-text">
                Allowance credited:{' '}
 <strong>
                  {usd(
                    (
                      BigInt(status.allowance_total_usd) - BigInt(before.allowance_total_usd)
                    ).toString(),
                  )}
 </strong>{' '}
                added, {usd(status.allowance_available_usd)} available now. Valid until{' '}
                {when(status.expires_at)}.
 </div>
            )}

            {!status ? (
 <p className="mt-3 text-sm text-muted-foreground">
                Choose an agent, or paste a payment key. Every figure here comes back from the
                coordinator for that exact key — nothing on this page is inferred.
 </p>
            ) : (
 <dl className="mt-3 space-y-2 text-sm">
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Key</dt>
 <dd className="font-mono text-right break-all">
                    #{status.nonce}
                    {status.is_agent ? ' (agent)' : ''}
 </dd>
 </div>
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Subscription</dt>
 <dd className="font-medium text-foreground">
                    {status.has_subscription ? (status.expired ? 'expired' : 'active') : 'none'}
 </dd>
 </div>
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Allowance left</dt>
 <dd className="font-mono">{usd(status.allowance_available_usd)}</dd>
 </div>
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Allowance bought</dt>
 <dd className="font-mono">{usd(status.allowance_total_usd)}</dd>
 </div>
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Key balance</dt>
 <dd className="font-mono">{usd(status.balance)}</dd>
 </div>
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Expires</dt>
 <dd>{when(status.expires_at)}</dd>
 </div>
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Accepts new calls until</dt>
 <dd>{when(status.accepting_calls_until)}</dd>
 </div>
 </dl>
            )}

            {status && (
 <p className="mt-3 text-xs text-muted-foreground">
                New calls stop being accepted slightly before the subscription expires, so a call
                already running cannot be cut off by the deadline arriving mid-flight.
 </p>
            )}

 <button
              onClick={loadStatus}
 className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm"
            >
              Refresh
 </button>
 </section>
 </div>
 </div>
 </div>
  );
}
