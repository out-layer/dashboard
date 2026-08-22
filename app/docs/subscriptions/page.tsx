'use client';

import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Connectors, subscriptions, trial keys and the quota — the four things that
 * decide what a call costs and whether it is allowed to run.
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
            . Nothing about the share depends on how the caller paid: money, allowance or trial,
            the author is credited the same.
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
 <strong>Where the agent&apos;s key comes from.</strong> It is created once, with{' '}
 <code className="bg-card-muted px-1 rounded">
              POST /wallet/v1/create-payment-key
 </code>{' '}
            and <code className="bg-card-muted px-1 rounded">{'{"agent": true}'}</code>. No key
            string comes back and none is stored — the key is named after the wallet, and the{' '}
 <code className="bg-card-muted px-1 rounded">wk_</code> you already hold is what spends it.
            A wallet has exactly one. Until it exists,{' '}
 <code className="bg-card-muted px-1 rounded">GET /subscription/status</code> with that{' '}
 <code className="bg-card-muted px-1 rounded">wk_</code> answers{' '}
 <code className="bg-card-muted px-1 rounded">401 Missing X-Payment-Key header</code> — the
            wallet has no key of its own to report on yet.
 </p>
 <p className="text-foreground mt-3">
 <strong>A subscription is bought for an AGENT&apos;s key.</strong> An agent has no payment
            key string to present — its <code className="bg-card-muted px-1 rounded">wk_</code>{' '}
            stands for it, and the coordinator resolves the key from that. So the purchase names
            the key instead: an <code className="bg-card-muted px-1 rounded">ft_transfer_call</code>{' '}
            carrying{' '}
 <code className="bg-card-muted px-1 rounded">
              {'{"action":"buy_subscription","nonce":N,"owner":"<agent>","plan":0}'}
 </code>
            . The sender pays and the agent carries the allowance, so one transaction from your
            wallet subscribes an agent that owns nothing.
 </p>
 <p className="text-foreground mt-3">
            The <code className="bg-card-muted px-1 rounded">wk_</code> itself buys nothing: it
            reads its own status, allowance and expiry and authorises nothing that spends. Buying,
            and choosing where warnings are sent, stay with the owner — a compromised agent should
            not be able to do them on your behalf.
 </p>
 <p className="text-foreground mt-3">
 <strong>Why the agent&apos;s key and not any key.</strong> Technically a subscription is
            not a special kind of key: it is an attribute an ordinary payment key can carry too.
            But a wallet has exactly ONE agent key, so &quot;the agent&apos;s subscription&quot;
            names one thing, while an account can hold many ordinary keys and each could carry a
            subscription of its own. Nothing merges them and nothing warns, so two subscribed keys
            means paying twice for one agent&apos;s worth of work. Our interface therefore offers
            the shape that cannot be got wrong — and if you ever do want several, on several
            agents, nothing stops you: it just rarely pays for itself at today&apos;s prices.
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
 <AnchorHeading id="trial-keys">Trial keys, old and new</AnchorHeading>
 <p className="text-foreground">
 <strong>What a trial key used to be:</strong> a small balance that could be spent on
            anything, including running arbitrary WASI code at our expense.
 </p>
 <p className="text-foreground mt-3">
 <strong>What it is now:</strong> a grant, scoped to the curated connectors, so that the
            thing you can try for free is the thing we sell. Concretely:
 </p>
 <ul className="list-disc pl-6 mt-3 space-y-2 text-foreground">
 <li>
              its value is an <strong>allowance</strong>, not a balance — granted by us, never
              withdrawable, and it ends at its expiry. A balance is the customer&apos;s money, and
              money does not expire;
 </li>
 <li>
              it is a <strong>grant</strong>: it cannot be withdrawn and cannot be used to pay a
              developer through <code className="bg-card-muted px-1 rounded">X-Attached-Deposit</code>,
              so it can only ever become compute and connector fees;
 </li>
 <li>
              it is <strong>scoped to the connector namespace</strong> and nothing else, so it
              cannot run arbitrary code on our account;
 </li>
 <li>
              it carries <strong>no wallet</strong>. A trial call gets no custody host functions:
              a connector that spends real balances is not a &quot;try before you buy&quot;
              operation.
 </li>
 </ul>
 <p className="text-foreground mt-3">
            One per wallet, claimable within a window after the wallet is created, valid for a
            number of days — all three are operator settings rather than constants, and the claim
            endpoint reports the exact values it granted. There is also a per-IP cap, which exists
            for the obvious reason.
 </p>
        </section>

        <section id="quota">
 <AnchorHeading id="quota">The per-wallet connector quota</AnchorHeading>
 <p className="text-foreground">
            Connector calls are also rate-limited per wallet, by a ladder that widens as the wallet
            gets older. The shipped ladder starts at <strong>10 calls a day</strong> for a wallet in
            its first 24 hours, <strong>50</strong> after a day, and <strong>500</strong> after a
            week. Operators can change the ladder; the numbers live in the coordinator&apos;s
 <code className="bg-card-muted px-1 rounded">connector_quota_tiers</code> table.
 </p>
 <p className="text-foreground mt-3">
 <strong>The quota is independent of paying.</strong> It is not a feature a subscription
            unlocks and it is not something a subscription takes away: it exists so that one busy
            agent cannot exhaust the workers, and so that one abuser cannot ruin deliverability for
            everyone sharing a connector&apos;s reputation. A subscriber and a non-subscriber of the
            same wallet age get the same ladder.
 </p>
 <p className="text-foreground mt-3">
            What a subscription changes is <em>how a call is paid for</em>, not how many are
            allowed. What the quota changes is <em>how many</em>, not the price. They are two
            different questions and neither answer moved when the other was introduced.
 </p>
        </section>

        <section id="what-changed">
 <AnchorHeading id="what-changed">What changed, plainly</AnchorHeading>
 <ul className="list-disc pl-6 space-y-2 text-foreground">
 <li>
              Connectors now carry their prices <strong>on chain</strong>, per operation, and the
              contract charges the exact operation named in the request. Over-payment is returned;
              the caller pays the price, not what they attached.
 </li>
 <li>
              Connector authors are credited <strong>on chain</strong>, per operation, out of that
              price.
 </li>
 <li>
              A subscription is a new way to pay for those calls, bought for an AGENT&apos;s key.
              Everything that worked before — a funded payment key, paid per call — works exactly
              as it did.
 </li>
 <li>
              Trial keys are now scoped to connectors. Running arbitrary WASI is still available on
              a funded key, exactly as it always was; what changed is that we no longer fund it for
              you.
 </li>
 </ul>
        </section>
 </div>
 </div>
  );
}
