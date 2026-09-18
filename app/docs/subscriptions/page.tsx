'use client';

import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Connectors, subscriptions and the trial — what decides what a call costs and
 * whether it is allowed to run.
 *
 * Every figure here is the one the code actually uses. Where a number is an
 * operator setting rather than a constant, it says so instead of pretending it
 * is fixed forever.
 */
export default function SubscriptionsDocsPage() {
  useHashNavigation();

  return (
 <div className="prose max-w-none">
 <h2 className="text-3xl font-bold mb-6 text-accent-text">Connectors & Subscriptions</h2>

 <div className="space-y-8">
        <section id="connectors">
 <AnchorHeading id="connectors">What a connector is</AnchorHeading>
 <p className="text-foreground">
            A connector is a curated project that sells named <strong>operations</strong> rather
            than raw compute. It runs in the same TEE as everything else here; what makes it a
            connector is that its prices live on chain and that we vouch for it.
 </p>
 <p className="text-foreground mt-3">
            Writing one? See{' '}
 <a href="/docs/connectors" className="text-accent-text underline">Building a Connector</a>{' '}
            — the manifest, the network allowlist, the answer format and what can refuse a call to you.
 </p>
 <p className="text-foreground mt-3">
            A request to one names the operation at the top of <code className="bg-card-muted px-1 rounded">input</code>:
 </p>
 <pre className="bg-card-muted p-3 rounded text-sm overflow-x-auto">
{`POST /call/connectors.outlayer.near/<connector>
{ "input": { "operation": "send_email", ... } }`}
 </pre>
 <p className="text-foreground mt-3">
            Each operation has its own price. An operation that is not on the list has no price at
            all and the call is refused — which is not the same as being free: a price of{' '}
 <code className="bg-card-muted px-1 rounded">0</code> is a real, published price and means the
            operation costs nothing beyond compute.
 </p>
        </section>

        <section id="author-share">
 <AnchorHeading id="author-share">The author&apos;s share</AnchorHeading>
 <p className="text-foreground">
            A connector is written by somebody, and that person is paid out of what the connector
            charges. The share is set <strong>per operation</strong>, in basis points of its price,
            and it is credited on chain when the call succeeds — to the author&apos;s account, not
            ours.
 </p>
 <p className="text-foreground mt-3">
            Per operation rather than per connector, deliberately: the economics of sending an
            email and of moving money are not the same number, so one share for a whole connector
            would have to be wrong for at least one of its operations.
 </p>
 <p className="text-foreground mt-3">
            Authors withdraw the same way every developer on OutLayer does — see{' '}
 <a href="/docs/earnings" className="text-accent-text underline">
              Earnings
 </a>
            . The share comes out of what a customer paid: a call paid with money, on chain or
            from a funded key, credits the author. A call covered by a subscription allowance or
            by a trial was not paid for by the caller, and credits the author nothing.
 </p>
        </section>

        <section id="subscriptions">
 <AnchorHeading id="subscriptions">Subscriptions</AnchorHeading>
 <p className="text-foreground">
            A subscription turns a key&apos;s per-call charges into a flat
            <strong> allowance</strong> for the period the plan runs. Without one, each call takes the compute it used plus the
            operation&apos;s price out of the key&apos;s balance. With one, the same calls come out
            of the allowance instead.
 </p>
 <ul className="list-disc pl-6 mt-3 space-y-2 text-foreground">
 <li>
              The allowance belongs to <strong>a key</strong>, not to an account. One account can
              hold several keys and subscribe only the one that needs it.
 </li>
 <li>
              A key can hold money <em>and</em> an allowance. The allowance is spent first; the
              balance is what keeps working when it runs out.
 </li>
 <li>
              Buying more never shortens what is already paid for — validity extends from whichever
              is later, today or the current expiry — and paying above a plan&apos;s price leaves
              the difference on the key as spendable balance rather than absorbing it.
 </li>
 <li>
              New calls stop being admitted slightly <em>before</em> the expiry, so a call already
              running is never cut off by the deadline arriving mid-flight.
 </li>
 </ul>
 <p className="text-foreground mt-3">
 <strong>Where the key comes from.</strong> A wallet creates it with{' '}
 <code className="bg-card-muted px-1 rounded">POST /wallet/v1/create-payment-key</code>. The answer carries the key string,{' '}
 <code className="bg-card-muted px-1 rounded">owner:nonce:secret</code>, shown once — it is what the agent sends as{' '}
 <code className="bg-card-muted px-1 rounded">X-Payment-Key</code> on every call, and what{' '}
 <code className="bg-card-muted px-1 rounded">GET /subscription/status</code> reads to report what the key has left.
 </p>
 <p className="text-foreground mt-3">
 <strong>A subscription is bought for a key, by naming it.</strong> The purchase is an{' '}
 <code className="bg-card-muted px-1 rounded">ft_transfer_call</code> carrying{' '}
 <code className="bg-card-muted px-1 rounded">
              {'{"action":"buy_subscription","nonce":N,"owner":"<key owner>","plan":0}'}
 </code>
            . The sender pays and the key carries the allowance, so one transaction from your
            wallet subscribes an agent that owns nothing — and nothing secret is needed to pay.
 </p>
 <p className="text-foreground mt-3">
            The wallet&apos;s <code className="bg-card-muted px-1 rounded">wk_</code> buys nothing and pays for nothing: it runs the
            wallet. On <code className="bg-card-muted px-1 rounded">/call</code> it is refused as{' '}
 <code className="bg-card-muted px-1 rounded">401 wk_is_not_a_payer</code>. Buying, and choosing where warnings are sent, stay
            with the owner — a compromised agent should not be able to do them on your behalf.
 </p>
 <p className="text-foreground mt-3">
 <strong>One subscribed key per agent.</strong> A subscription is an attribute any payment
            key can carry, and an account can hold many keys. Nothing merges them and nothing
            warns, so two subscribed keys means paying twice for one agent&apos;s worth of work.
 </p>
 <p className="text-foreground mt-3">
            An ordinary payment key with no subscription is not second-class: it pays per call out
            of its balance and reaches exactly the same connectors. The subscription is a wholesale
            rate, not a different class of access.
 </p>
 <p className="text-foreground mt-3">
            The{' '}
 <a href="/subscription" className="text-accent-text underline">
              Subscription page
 </a>{' '}
            does it in one step: pick an agent whose key this browser knows, and pay in one
            transaction.
 </p>
        </section>

        <section id="trial-keys">
 <AnchorHeading id="trial-keys">The trial: ten calls, in the wallet&apos;s first week</AnchorHeading>
 <p className="text-foreground">
            A trial is <strong>ten connector calls, within seven days of the wallet&apos;s creation</strong>.
            That is the whole rule. The wallet claims a key with{' '}
            <code className="bg-card-muted px-1 rounded">POST /trial-key</code>, sends it as{' '}
            <code className="bg-card-muted px-1 rounded">X-Payment-Key</code>, and the answer says how many calls it
            makes and when it stops working.
 </p>
 <ul className="list-disc list-inside text-foreground mt-3 space-y-1">
 <li>
              The week is counted from the wallet&apos;s creation, not from the claim: a trial claimed on day six
              works for one day. Claim it when you register.
 </li>
 <li>A call counts once it is accepted — any operation, a free one included, and whether or not the run then succeeds. A refused attempt costs nothing.</li>
 <li>
              The eleventh call answers <code className="bg-card-muted px-1 rounded">402 trial_exhausted</code>, and
              any call after the week <code className="bg-card-muted px-1 rounded">402 trial_expired</code>. Both are
              final; the next step is a payment key with money on it.
 </li>
 <li>
              It reaches the curated connectors and nothing else, cannot pay a developer through{' '}
              <code className="bg-card-muted px-1 rounded">X-Attached-Deposit</code>, and cannot be withdrawn.
 </li>
 <li>
              There is no balance to read — a trial is not measured in money.{' '}
              <code className="bg-card-muted px-1 rounded">GET /subscription/status</code> reports{' '}
              <code className="bg-card-muted px-1 rounded">trial.calls_left</code>.
 </li>
 </ul>
 <p className="text-foreground mt-3">One per wallet.</p>
        </section>

        <section id="no-quota">
 <AnchorHeading id="no-quota">A paying caller has no call quota</AnchorHeading>
 <p className="text-foreground">
            A caller who pays is not limited by any count of connector calls. A funded key is bounded by the
            money on it; a subscription by its allowance. If a task needs more than the trial, fund a key —
            there is no quota to wait out.
 </p>
 <p className="text-foreground mt-3">
            What remains is technical: a per-key rate limit per minute, one call in flight at a time for a key
            living on an allowance, and each connector&apos;s own ceiling on a single operation, there against a
            runaway loop and far above ordinary use — Gmail, for one, stops at 500 sends a day per wallet. An attempt refused by that cap still counts toward it, so wait for the window to end rather than retrying into it.
 </p>
        </section>
 </div>
 </div>
  );
}
