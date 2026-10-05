'use client';

import Link from 'next/link';
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
            A connector is a curated project that gives an agent named <strong>operations</strong> on
            an account that belongs to somebody else — a bank account, a mailbox, a GitHub login, a
            trading venue — without ever handing the agent the login. It runs in the same TEE as
            everything else here; what makes it a connector is that its prices live on chain and that
            we vouch for it. Three parties take part:
 </p>
 <ul className="list-disc pl-6 mt-3 space-y-2 text-foreground">
 <li>
 <strong>The owner</strong> connects the account once, on its page under{' '}
 <Link href="/connectors" className="text-accent-text underline">Integrations</Link>: saves the
            login, writes the rules — which operations, what limits, which payees or repositories, what
            must wait for them — and names the agents that may use it, for as long as they choose. The
            login is encrypted to the enclave and locked to the owner&apos;s account: the agent never
            sees it, and neither do we. Taking it back is one step.
 </li>
 <li>
 <strong>The agent</strong> makes one HTTPS call naming the operation, paid with its own payment
            key. It learns no venue API, signs no orders and holds no key; for the agent a payment, an
            email or a pull request is one request and one answer.
 </li>
 <li>
 <strong>The enclave</strong> runs the connector&apos;s published build: it opens the owner&apos;s
            login inside, checks every rule of the policy — outside the AI, so no prompt argues past
            it — reaches only the hosts the connector declared, and answers with the proof of what ran.
 </li>
 </ul>
 <p className="text-foreground mt-3">
 <strong>Asking first.</strong> A rule can say that a write waits for the owner: a payment above a
            line, every email, a merge. The connector then prepares the action whole, leaves it as a{' '}
 <Link href="/docs/tasks" className="text-accent-text underline">task</Link> and answers the
            agent <code className="bg-card-muted px-1 rounded">awaiting_owner</code>. The owner reads
            exactly what will happen in their <Link href="/inbox" className="text-accent-text underline">inbox</Link>{' '}
            and approves with one signature of their wallet; the platform runs the connector&apos;s{' '}
 <code className="bg-card-muted px-1 rounded">confirm</code> as the agent, and that exact action
            runs, nothing else. The same inbox carries what the agent asks of its owner — a question, a
            file, a missing value — and the notices it leaves. The owner is told on the site, or at a URL
            of their own: see{' '}
 <Link href="/docs/tasks#events" className="text-accent-text underline">Being told</Link>.
 </p>
 <p className="text-foreground mt-3">
 <strong>Nothing on trust.</strong> Every call answers with its attestation: the hash of the code
            that ran, of what went in and of what came out, signed by the Intel chip it ran on. A task
            in the inbox carries the same proof for the run that prepared it. See{' '}
 <Link href="/docs/trust-verification" className="text-accent-text underline">Trust &amp; Verification</Link>.
 </p>
 <p className="text-foreground mt-3">
 <strong>Teaching an agent.</strong> One URL is all it needs:{' '}
 <a href="https://skills.outlayer.ai/outlayer/SKILL.md" className="text-accent-text underline">skills.outlayer.ai/outlayer/SKILL.md</a>{' '}
            creates the wallet and makes the first call;{' '}
 <a href="https://skills.outlayer.ai/outlayer-connectors/SKILL.md" className="text-accent-text underline">outlayer-connectors/SKILL.md</a>{' '}
            is the model above as the agent reads it — the call, the payment key, the policy row, tasks and their outcomes. Each
            connector has a skill of its own with its operations, fields and refusals:{' '}
 <a href="https://skills.outlayer.ai/mercury-connector/SKILL.md" className="text-accent-text underline">mercury</a>,{' '}
 <a href="https://skills.outlayer.ai/gmail-connector/SKILL.md" className="text-accent-text underline">gmail</a>,{' '}
 <a href="https://skills.outlayer.ai/github-connector/SKILL.md" className="text-accent-text underline">github</a>,{' '}
 <a href="https://skills.outlayer.ai/hyperliquid-connector/SKILL.md" className="text-accent-text underline">hyperliquid</a>,{' '}
 <a href="https://skills.outlayer.ai/polymarket-connector/SKILL.md" className="text-accent-text underline">polymarket</a>.
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

        <section id="how-a-call-works">
 <AnchorHeading id="how-a-call-works">How a call works</AnchorHeading>
 <p className="text-foreground mb-3">
            The owner connects once; from then on every call is the agent&apos;s. The login is opened
            only inside the enclave, the rules are checked there, and the agent gets the answer with
            the proof. When a rule says <em>ask first</em>, the action waits for the owner and runs on
            their signature.
 </p>

          {/* Desktop Diagram - Hidden on mobile */}
 <div className="hidden md:block bg-card border-2 border-border-strong rounded-lg p-6 mb-4 overflow-x-auto">
 <svg viewBox="0 0 800 640" className="w-full" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <defs>
                <marker id="cArrowBlue" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="var(--info)" />
                </marker>
                <marker id="cArrowPurple" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="#a855f7" />
                </marker>
                <marker id="cArrowOrange" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="var(--accent)" />
                </marker>
                <marker id="cArrowGreen" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="var(--success)" />
                </marker>
                <marker id="cArrowGray" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill="#6b7280" />
                </marker>
              </defs>

              {/* Participant boxes */}
              <rect x="30" y="20" width="100" height="50" fill="var(--info)" rx="8" />
 <text x="80" y="50" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">Owner</text>

              <rect x="190" y="20" width="100" height="50" fill="#a855f7" rx="8" />
 <text x="240" y="50" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">Agent</text>

              <rect x="340" y="20" width="120" height="50" fill="var(--accent)" rx="8" />
 <text x="400" y="50" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">OutLayer</text>

              <rect x="500" y="20" width="120" height="50" fill="var(--success)" rx="8" />
 <text x="560" y="40" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">Connector</text>
 <text x="560" y="55" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">in the TEE</text>

              <rect x="670" y="20" width="100" height="50" fill="#6b7280" rx="8" />
 <text x="720" y="40" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">Bank / Gmail</text>
 <text x="720" y="55" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">/ GitHub</text>

              {/* Lifelines */}
              <line x1="80" y1="70" x2="80" y2="580" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5,5" />
              <line x1="240" y1="70" x2="240" y2="580" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5,5" />
              <line x1="400" y1="70" x2="400" y2="580" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5,5" />
              <line x1="560" y1="70" x2="560" y2="580" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5,5" />
              <line x1="720" y1="70" x2="720" y2="580" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5,5" />

              {/* Step 1: Owner -> OutLayer, once */}
              <line x1="80" y1="100" x2="400" y2="100" stroke="var(--info)" strokeWidth="2" markerEnd="url(#cArrowBlue)" />
 <text x="240" y="95" textAnchor="middle" fontSize="11" fill="var(--info)" fontWeight="bold">1. connect, once</text>
 <text x="240" y="112" textAnchor="middle" fontSize="9" fill="var(--info)">save the login, write the rules, name the agent</text>

              {/* Encrypted box */}
              <rect x="330" y="122" width="140" height="40" fill="var(--card-muted)" stroke="var(--info)" strokeWidth="2" rx="4" />
 <text x="400" y="137" textAnchor="middle" fontSize="10" fontWeight="bold" fill="var(--info)">Encrypted to the enclave</text>
 <text x="400" y="152" textAnchor="middle" fontSize="9" fill="var(--info)">locked to the owner&apos;s account</text>

              {/* Step 2: Agent -> OutLayer */}
              <line x1="240" y1="195" x2="400" y2="195" stroke="#a855f7" strokeWidth="2" markerEnd="url(#cArrowPurple)" />
 <text x="320" y="190" textAnchor="middle" fontSize="11" fill="#7e22ce" fontWeight="bold">2. POST /call</text>
 <text x="320" y="207" textAnchor="middle" fontSize="9" fill="#7e22ce">{'{ operation, ... }'} + its payment key</text>

              {/* Step 3: OutLayer -> Connector */}
              <line x1="400" y1="240" x2="560" y2="240" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#cArrowOrange)" />
 <text x="480" y="235" textAnchor="middle" fontSize="11" fill="var(--accent)" fontWeight="bold">3. run the published build</text>

              {/* Enclave box */}
              <rect x="480" y="255" width="160" height="92" fill="var(--card-muted)" stroke="var(--success)" strokeWidth="2" rx="4" />
 <text x="490" y="273" textAnchor="start" fontSize="10" fontWeight="bold" fill="var(--success)">Inside the enclave:</text>
 <text x="490" y="289" textAnchor="start" fontSize="9" fill="var(--success)">• open the owner&apos;s login</text>
 <text x="490" y="304" textAnchor="start" fontSize="9" fill="var(--success)">• check every rule (not the prompt)</text>
 <text x="490" y="319" textAnchor="start" fontSize="9" fill="var(--success)">• reach only the declared hosts</text>
 <text x="490" y="334" textAnchor="start" fontSize="9" fill="var(--success)">• no &quot;show me the key&quot; action</text>

              {/* Ask-first branch */}
              <rect x="30" y="365" width="440" height="70" fill="#fef3c7" stroke="var(--warning)" strokeWidth="2" rx="4" />
 <text x="40" y="382" textAnchor="start" fontSize="10" fontWeight="bold" fill="var(--accent-text)">⏸ If a rule says ask first</text>
 <text x="40" y="397" textAnchor="start" fontSize="9" fill="var(--accent-text)">The action waits as a task in the owner&apos;s inbox; the agent gets awaiting_owner.</text>
 <text x="40" y="411" textAnchor="start" fontSize="9" fill="var(--accent-text)">The owner reads exactly what will happen and approves with one signature.</text>
 <text x="40" y="425" textAnchor="start" fontSize="9" fill="var(--accent-text)">The platform runs confirm as the agent: that action, once. The owner is told on the site or at a webhook.</text>
              <line x1="470" y1="400" x2="560" y2="400" stroke="var(--warning)" strokeWidth="2" strokeDasharray="4,3" />

              {/* Step 4: Connector -> Service */}
              <line x1="560" y1="465" x2="720" y2="465" stroke="var(--success)" strokeWidth="2" markerEnd="url(#cArrowGreen)" />
 <text x="640" y="460" textAnchor="middle" fontSize="11" fill="var(--success)" fontWeight="bold">4. the operation</text>
 <text x="640" y="477" textAnchor="middle" fontSize="9" fill="var(--success)">pay, send, open a PR</text>

              {/* Service answer */}
              <line x1="720" y1="505" x2="560" y2="505" stroke="#6b7280" strokeWidth="2" markerEnd="url(#cArrowGray)" />
 <text x="640" y="500" textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="bold">the service&apos;s answer</text>

              {/* Step 5: Connector -> Agent */}
              <line x1="560" y1="545" x2="240" y2="545" stroke="var(--accent)" strokeWidth="2" markerEnd="url(#cArrowOrange)" />
 <text x="400" y="540" textAnchor="middle" fontSize="11" fill="var(--accent-text)" fontWeight="bold">5. result + attestation</text>
 <text x="400" y="557" textAnchor="middle" fontSize="9" fill="var(--accent-text)">which code ran, what went in, what came out — signed by the Intel chip</text>

              {/* Final */}
              <rect x="80" y="585" width="640" height="40" fill="var(--card-muted)" stroke="var(--success)" strokeWidth="2" rx="8" />
 <text x="400" y="610" textAnchor="middle" fontSize="12" fontWeight="bold" fill="var(--success)">The agent has its answer. The login never left the enclave. Anyone can verify the run.</text>
            </svg>
          </div>

          {/* Mobile Simplified Diagram */}
 <div className="md:hidden bg-gradient-to-b from-card-muted to-blue-50 border-2 border-border-strong rounded-lg p-4 mb-4">
 <div className="space-y-3 text-sm">
 <div className="flex items-center gap-2">
 <div className="flex-shrink-0 w-8 h-8 bg-card-muted rounded-full flex items-center justify-center text-white font-bold text-xs">1</div>
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <span className="font-semibold text-foreground">Owner</span>
 <span className="text-muted-foreground">→</span>
 <span className="font-semibold text-foreground">OutLayer</span>
                  </div>
 <div className="text-xs text-muted-foreground mt-0.5">connect once: save the login, write the rules, name the agent</div>
                </div>
              </div>
 <div className="ml-10 p-3 bg-card-muted border-l-4 border-blue-500 rounded">
 <div className="font-bold text-foreground text-xs">Encrypted to the enclave, locked to the owner&apos;s account</div>
              </div>

 <div className="flex items-center gap-2">
 <div className="flex-shrink-0 w-8 h-8 bg-card-muted rounded-full flex items-center justify-center text-white font-bold text-xs">2</div>
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <span className="font-semibold text-foreground">Agent</span>
 <span className="text-muted-foreground">→</span>
 <span className="font-semibold text-foreground">OutLayer</span>
                  </div>
 <div className="text-xs text-muted-foreground mt-0.5">POST /call with the operation and its payment key</div>
                </div>
              </div>

 <div className="flex items-center gap-2">
 <div className="flex-shrink-0 w-8 h-8 bg-card-muted rounded-full flex items-center justify-center text-white font-bold text-xs">3</div>
 <div className="flex items-center gap-2 flex-1">
 <span className="font-semibold text-foreground">OutLayer</span>
 <span className="text-muted-foreground">→</span>
 <span className="font-semibold text-foreground">Connector in the TEE</span>
                </div>
              </div>
 <div className="ml-10 p-3 bg-card-muted border-l-4 border-border rounded">
 <div className="font-bold text-foreground text-xs mb-1">Inside the enclave:</div>
 <div className="text-xs text-foreground space-y-0.5">
 <div>• open the owner&apos;s login</div>
 <div>• check every rule (not the prompt)</div>
 <div>• reach only the declared hosts</div>
 <div>• no &quot;show me the key&quot; action</div>
                </div>
              </div>
 <div className="ml-10 p-3 bg-card-muted border-l-4 border-yellow-500 rounded">
 <div className="font-bold text-foreground text-xs">⏸ If a rule says ask first</div>
 <div className="text-xs text-foreground mt-1">The action waits in the owner&apos;s inbox. The owner approves with one signature; the platform runs confirm as the agent. Told on the site or at a webhook.</div>
              </div>

 <div className="flex items-center gap-2">
 <div className="flex-shrink-0 w-8 h-8 bg-success rounded-full flex items-center justify-center text-white font-bold text-xs">4</div>
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <span className="font-semibold text-foreground">Connector</span>
 <span className="text-muted-foreground">→</span>
 <span className="font-semibold text-foreground">Bank / Gmail / GitHub</span>
                  </div>
 <div className="text-xs text-muted-foreground mt-0.5">the operation: pay, send, open a PR</div>
                </div>
              </div>

 <div className="flex items-center gap-2">
 <div className="flex-shrink-0 w-8 h-8 bg-card-muted rounded-full flex items-center justify-center text-white font-bold text-xs">5</div>
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <span className="font-semibold text-foreground">Connector</span>
 <span className="text-muted-foreground">→</span>
 <span className="font-semibold text-foreground">Agent</span>
                  </div>
 <div className="text-xs text-muted-foreground mt-0.5">result + attestation, signed by the Intel chip</div>
                </div>
              </div>

 <div className="p-3 bg-card-muted border-2 border-green-600 rounded-lg text-center">
 <div className="font-bold text-foreground text-xs">The login never left the enclave</div>
 <div className="text-xs text-foreground mt-1">Anyone can verify the run</div>
              </div>
            </div>
          </div>
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
 <AnchorHeading id="trial-keys">The trial: fifty calls, in the wallet&apos;s first week</AnchorHeading>
 <p className="text-foreground">
            A trial is <strong>fifty connector calls, within seven days of the wallet&apos;s creation</strong>.
            That is the whole rule. The wallet claims a key with{' '}
            <code className="bg-card-muted px-1 rounded">POST /trial-key</code> — under its{' '}
            <code className="bg-card-muted px-1 rounded">Bearer wk_…</code> or a{' '}
            <code className="bg-card-muted px-1 rounded">Bearer near:…</code> signature — sends it as{' '}
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
              The fifty-first call answers <code className="bg-card-muted px-1 rounded">402 trial_exhausted</code>, and
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
 <li>
              The key is derived, not random: <code className="bg-card-muted px-1 rounded">GET /wallet/v1/payment-key</code>{' '}
              answers it again, under the credential that claimed it — nothing needs storing. It is bound to that
              credential: another <code className="bg-card-muted px-1 rounded">wk_</code> of the wallet cannot read it
              (<code className="bg-card-muted px-1 rounded">403 payment_key_other_credential</code>), and once that{' '}
              <code className="bg-card-muted px-1 rounded">wk_</code> is revoked the key stops working for good.
 </li>
 </ul>
 <p className="text-foreground mt-3">One per wallet.</p>
        </section>

        <section id="sponsor-codes">
 <AnchorHeading id="sponsor-codes">Sponsor codes: premium somebody else pays for</AnchorHeading>
 <p className="text-foreground">
            A sponsor code (<code className="bg-card-muted px-1 rounded">spn_…</code>) is a secret a person or a
            service gives you — a one-time link from a friend, a voucher, or the backend that runs your agent.
            Redeeming it puts a subscription, paid by the sponsor, on the wallet&apos;s nonce-0 key: the trial&apos;s
            key if it was claimed (the trial is converted — no call count), a new key if not.
 </p>
 <pre className="bg-card-muted p-3 rounded text-sm overflow-x-auto mt-2"><code>{`POST /wallet/v1/sponsorship        Authorization: Bearer wk_…  (or near:…)
{"code": "spn_…"}

→ {"payment_key": "<owner>:0:<key>", "owner": "…", "nonce": 0,
   "allowance_usd": "10000000", "expires_at": "…", "sponsor": "…", "project_ids": […]}`}</code></pre>
 <ul className="list-disc list-inside text-foreground mt-3 space-y-1">
 <li>No claim window; it works with or without a trial.</li>
 <li>
              A key carries one sponsor while its grant is live: the same code again, or another code before the
              grant ends, changes nothing and answers what the key holds. After it ends, another code is taken —
              never one this wallet redeemed before.
 </li>
 <li>
              Only the credential that reads the wallet&apos;s nonce-0 key redeems onto it (another live one is{' '}
              <code className="bg-card-muted px-1 rounded">403 payment_key_other_credential</code>), with one
              exception, in which the redeem first binds the key to the caller: an older random key goes to the
              caller that sends it as <code className="bg-card-muted px-1 rounded">X-Payment-Key</code> (without it,{' '}
              <code className="bg-card-muted px-1 rounded">409 payment_key_not_recoverable</code>). A refused redeem
              takes no use of the code; a redeem that succeeds always returns the key that now works.
 </li>
 <li>
              The subscription pays for connector calls. It lifts the free tier&apos;s custody limits only when the
              sponsor set the code up to.
 </li>
 <li>
              Refusals: <code className="bg-card-muted px-1 rounded">404 sponsor_code_invalid</code> (one answer for
              every reason), <code className="bg-card-muted px-1 rounded">409 sponsor_cannot_top_up</code> (the key
              already holds more), <code className="bg-card-muted px-1 rounded">409 payment_key_deleted</code> /{' '}
              <code className="bg-card-muted px-1 rounded">payment_key_revoked</code>.
 </li>
 <li>
              A sponsored key may be allowed several calls in flight at once; the code sets how many. Like every
              nonce-0 key it cannot be bought on: when the grant ends, buy on a payment key the wallet creates.
 </li>
 </ul>
 <p className="text-foreground mt-3">
            In the dashboard, <Link href="/wallet/new" className="text-accent-text hover:underline">New agent</Link>{' '}
            takes a code when it creates the agent; a sponsor&apos;s link{' '}
            <code className="bg-card-muted px-1 rounded">/redeem?code=…</code> opens it with the code filled in. From
            the CLI: <code className="bg-card-muted px-1 rounded">outlayer redeem spn_…</code>.
 </p>
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
            living on an allowance (a sponsored key: as many as its code allows), and each connector&apos;s own ceiling on a single operation, there against a
            runaway loop and far above ordinary use — Gmail, for one, stops at 500 sends a day per wallet. An attempt refused by that cap still counts toward it, so wait for the window to end rather than retrying into it.
 </p>
        </section>
 </div>
 </div>
  );
}
