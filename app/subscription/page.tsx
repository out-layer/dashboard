'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { actionCreators } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { InfoHint } from '@/components/ui/info-hint';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';

/**
 * Buy a subscription, and see when it starts and how long it lasts.
 *
 * A subscription is a PRICE, not a kind of key. Any payment key can carry one,
 * and the same key reaches the same endpoints with or without it — what changes
 * is what a call costs: retail out of the key's own money, or wholesale out of
 * an allowance bought up front.
 *
 * It is bought ON CHAIN by naming owner and nonce in an `ft_transfer_call`, so
 * the payment itself carries nothing secret and anyone can pay for somebody
 * else's key. The key string is asked for only to READ what the key carries —
 * `/subscription/status` reports on the key presented to it — and it is held
 * in component state, never stored.
 *
 * One caution worth repeating to the user: two subscribed keys are two budgets.
 * Nothing merges them and nothing warns, so a person who subscribes a second
 * key pays twice for one agent's worth of work.
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
  has_subscription: boolean;
  expires_at: string | null;
  accepting_calls_until: string | null;
  /** A trial key only. A trial is a number of calls, and the three allowance
   *  figures are then absent — show the calls, never a dollar figure. */
  trial?: { calls: number; calls_used: number; calls_left: number };
  allowance_total_usd?: string;
  allowance_spent_usd?: string;
  allowance_available_usd?: string;
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

  const [plans, setPlans] = useState<Plan[]>([]);
  /**
   * The payment key whose subscription this is, `owner:nonce:secret`.
   *
   * Pasted, held in this component and nowhere else — not in storage, not in the
   * URL. `/subscription/status` reports on the key presented to it, so the key
   * is what the page needs; a wallet's `wk_` does not name one.
   */
  const [paymentKey, setPaymentKey] = useState('');
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

  // The "before" reading belongs to ONE key. Another key must forget it:
  // comparing this key's allowance against the last one's would announce a
  // credit that never happened.
  useEffect(() => {
    setBefore(null);
    setNotice(null);
  }, [paymentKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const presentedKey = paymentKey.trim();
  // The coordinator's own rule for the secret: 64 hex characters. Nothing is
  // sent until the WHOLE key is here — a looser test would post every prefix of
  // the secret as it is typed.
  const keyLooksRight = /^[^:\s]+:\d+:[0-9a-fA-F]{64}$/.test(presentedKey);
  // Which read is the current one. An answer to an earlier key must not land on
  // the screen — or in the purchase, which names `status.owner` and `nonce`.
  const readSeq = useRef(0);

  /**
   * What this key carries. The answer names the owner and nonce the on-chain
   * purchase has to name, so nothing else has to know them.
   */
  const loadStatus = useCallback(async () => {
    const seq = ++readSeq.current;
    // Whatever was on screen belonged to the key before this one: its figures,
    // its error — and the owner and nonce a purchase would name. Gone before
    // the new read starts, so nothing can be bought for the previous key while
    // this one is still loading.
    setStatus(null);
    setError(null);
    if (!keyLooksRight) return;
    const headers = { 'X-Payment-Key': presentedKey };

    try {
      const resp = await fetch(`${coordinatorUrl}/subscription/status`, { headers });
      if (seq !== readSeq.current) return;
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`Could not read the subscription (HTTP ${resp.status}): ${body}`);
      }
      const read = (await resp.json()) as SubscriptionStatus;
      if (seq !== readSeq.current) return;
      setStatus(read);
    } catch (err) {
      if (seq !== readSeq.current) return;
      setStatus(null);
      setError((err as Error).message);
    }
  }, [coordinatorUrl, presentedKey, keyLooksRight]);

  // The latest `loadStatus`, for the delayed re-read after a payment: a timer
  // holding the closure it was created with would read a key since replaced.
  const loadStatusRef = useRef(loadStatus);
  useEffect(() => {
    loadStatusRef.current = loadStatus;
  }, [loadStatus]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  /**
   * The subscription is bought ON CHAIN.
   *
   * `buy_subscription` names the key by owner and nonce, so no key string is
   * involved anywhere — which is why anyone can pay for somebody else's key
   * without ever holding its secret. The
   * money is revenue on arrival rather than the key's balance, and the
   * coordinator grants the allowance against the event the contract emits, so
   * it appears a moment after the transaction rather than inside it.
   */
  const buyForKey = async (plan: Plan) => {
    setError(null);
    setNotice(null);
    if (!isConnected) {
      setError('Connect your NEAR wallet — it sends the payment.');
      return;
    }
    if (!status) {
      setError('Paste the payment key the subscription is for.');
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
            // subscription belongs to the KEY's owner, and the sender is you.
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
      setTimeout(() => loadStatusRef.current(), 4000);
    } catch (err) {
      setError(`The payment did not go through: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // A trial key has no record on chain — nonce 0 is the coordinator's own — so
  // a purchase naming it is refused by the contract and refunded. Never offered.
  const isTrial = Boolean(status?.trial);
  const canBuy = Boolean(status) && !isTrial && isConnected;

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
                    A subscription belongs to one payment key. The key is read here to find its
                    owner and number — that is what the on-chain payment names — and to show what it
                    carries. It stays in this tab: it is not saved and not sent anywhere but the
                    coordinator.
 </>
                }
              />
 </h2>

 <div className="mt-4">
 <label className="block">
 <span className="text-sm font-medium text-foreground">Payment key</span>
 <input
                  type="password"
                  // Not "off": browsers ignore that on a password field and offer
                  // to SAVE it. This value is what they leave alone.
                  autoComplete="one-time-code"
                  spellCheck={false}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                  placeholder="owner:nonce:secret"
                  value={paymentKey}
                  onChange={(e) => setPaymentKey(e.target.value)}
                />
 <span className="mt-1 block text-xs text-muted-foreground">
                  The string <code>create-payment-key</code> returned — what the agent sends as{' '}
 <code>X-Payment-Key</code>.
                  {presentedKey && !keyLooksRight
                    ? ' It has three parts: owner, number, and a secret of 64 hex characters.'
                    : ''}{' '}
                  It is kept only while this tab is open: after a wallet that redirects, paste it
                  again to see the allowance land.
 </span>
 </label>
 </div>
 </section>

 <section className="rounded-lg border border-border bg-card p-5">
 <h2 className="text-lg font-semibold text-foreground">Pay</h2>
 <p className="mt-2 text-sm text-muted-foreground">
              One transaction from your wallet, in stablecoin, naming the key by its owner and
              number. You pay; the key is what carries the allowance — it needs no NEAR and no
              balance of its own for this.
 </p>

            {isTrial && (
 <p className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
                This is a trial key. A trial cannot carry a subscription — create a payment key for
                the agent and subscribe that one.
 </p>
            )}
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
                      onClick={() => buyForKey(plan)}
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
              status.allowance_total_usd !== undefined &&
              before.allowance_total_usd !== undefined &&
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
                Paste a payment key. Every figure here comes back from the
                coordinator for that exact key — nothing on this page is inferred.
 </p>
            ) : (
 <dl className="mt-3 space-y-2 text-sm">
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Key</dt>
 <dd className="font-mono text-right break-all">
                    #{status.nonce}
 </dd>
 </div>
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Subscription</dt>
 <dd className="font-medium text-foreground">
                    {status.trial
                      ? 'trial'
                      : status.has_subscription
                        ? status.expired
                          ? 'expired'
                          : 'active'
                        : 'none'}
 </dd>
 </div>
                {status.trial ? (
 <div className="flex justify-between gap-3">
 <dt className="text-muted-foreground">Trial calls left</dt>
 <dd className="font-mono">
                      {status.trial.calls_left} of {status.trial.calls}
 </dd>
 </div>
                ) : (
 <>
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
 </>
                )}
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
