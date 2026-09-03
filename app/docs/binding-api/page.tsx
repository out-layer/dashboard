'use client';

import Link from 'next/link';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Binding API reference — every endpoint an integration touches, its arguments,
 * and the refusals it can meet.
 *
 * Written for a developer wiring an agent to a bound account, which the two
 * conceptual pages do not serve: between them they name two endpoints, and an
 * integration touches ten. What they were missing is not prose but the
 * arguments, the response fields, and which refusals are worth retrying.
 *
 * Hand-written rather than rendered from the OpenAPI document on purpose. The
 * spec says what the fields are; this page says which of two accounts an
 * endpoint is about, which is the thing every reader gets wrong first and the
 * one thing a schema cannot express.
 */
export default function BindingApiPage() {
  useHashNavigation();

  const th = 'text-left font-semibold px-3 py-2 border-b border-border';
  const td = 'align-top px-3 py-2 border-b border-border';
  const code = 'bg-card-muted px-1 rounded text-[0.9em]';

  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl font-bold mb-3">Binding API reference</h1>
      <p className="text-lg text-muted-foreground mb-6">
        Every endpoint a bound-account integration touches, what it takes, what it answers, and how
        to read a refusal.
      </p>

      <div className="bg-card-muted border-l-4 border-amber-500 p-4 mb-8">
        <p className="text-sm text-foreground">
          <strong>Read the concepts first.</strong>{' '}
          <Link href="/docs/account-binding" className="text-accent-text underline">
            Personal Account Binding
          </Link>{' '}
          for an account you own,{' '}
          <Link href="/docs/agent-connect" className="text-accent-text underline">
            Agent Connect
          </Link>{' '}
          for a leased one. This page assumes you know which mode you are in and want the calls.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="two-accounts" className="mb-10 scroll-mt-4">
        <AnchorHeading id="two-accounts">Two accounts, and which endpoint means which</AnchorHeading>
        <p className="text-foreground mb-4">
          A bound wallet has <strong>two account identities holding two different kinds of
          money</strong>, and almost every integration bug starts by confusing them.
        </p>
        <ul className="list-disc pl-6 space-y-2 text-foreground mb-4">
          <li>
            The <strong>executor</strong> — the wallet&apos;s own NEAR account, derived inside the
            enclave. It holds the gas. It is the account the chain sees signing.
          </li>
          <li>
            The <strong>asset account</strong> — the bound account, whose name the agent acts under
            and whose balance the agent spends.
          </li>
        </ul>
        <p className="text-foreground mb-4">
          The rule that resolves it: <strong>everything under{' '}
          <code className={code}>/wallet/v1/binding/</code> is about the ASSET account, and
          everything else under <code className={code}>/wallet/v1/</code> is about the wallet&apos;s
          own account unless you ask otherwise.</strong> So{' '}
          <code className={code}>/wallet/v1/balance</code> and{' '}
          <code className={code}>/wallet/v1/binding/balance</code> are two different balances, and
          both answers are correct.
        </p>
        <p className="text-foreground">
          The read side also accepts <code className={code}>account=asset</code> on{' '}
          <code className={code}>/wallet/v1/balance</code>, which answers exactly as{' '}
          <code className={code}>/binding/balance</code> does. <strong>Omitting it still means the
          executor</strong> — the default does not follow the binding, because a number that
          silently changed which account it describes is the whole failure this split exists to
          prevent. On a wallet with no active binding, <code className={code}>account=asset</code> is
          refused rather than answered with the executor&apos;s figure under an asset label.
        </p>
        <p className="text-foreground">
          This is a URL split rather than a flag on the WRITE side because those are not the same
          operation.{' '}
          <code className={code}>/wallet/v1/transfer</code> signs a plain NEAR transfer from the
          wallet&apos;s account. <code className={code}>/wallet/v1/binding/transfer</code> signs a
          contract call against the asset account under an on-chain grant — a different signed
          object, a different set of refusals, a different approval path.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="auth" className="mb-10 scroll-mt-4">
        <AnchorHeading id="auth">Authentication</AnchorHeading>
        <p className="text-foreground mb-4">
          Wallet endpoints accept either credential; they identify the same wallet.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead className="bg-card-muted">
              <tr>
                <th className={th}>Header</th>
                <th className={th}>Who uses it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}><code className={code}>Authorization: Bearer near:&lt;sig&gt;</code></td>
                <td className={td}>
                  The wallet&apos;s owner, signing with their NEAR key. This is the deterministic
                  wallet derived from an account plus a seed.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>Authorization: Bearer wk_…</code></td>
                <td className={td}>A wallet API key, for a randomly-derived wallet.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>X-Binding-Webhook-Secret</code></td>
                <td className={td}>
                  The partner, on <code className={code}>/wallet/v1/binding/events</code> only. A
                  shared secret, compared as digests. This is the one endpoint an outside party
                  calls.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-foreground">
          <code className={code}>X-Wallet-Id</code> is not a credential. It confirms the wallet the
          credential already names, and naming somebody else&apos;s is refused. A guest job needs it
          explicitly before the enclave will give the module its wallet imports — spending is
          opt-in, never ambient.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="endpoints" className="mb-10 scroll-mt-4">
        <AnchorHeading id="endpoints">The endpoints</AnchorHeading>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead className="bg-card-muted">
              <tr>
                <th className={th}>Call</th>
                <th className={th}>About</th>
                <th className={th}>Modes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}><code className={code}>PUT /wallet/v1/binding</code></td>
                <td className={td}>Record the binding</td>
                <td className={td}>both</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>GET /wallet/v1/binding</code></td>
                <td className={td}>Status, gas, versions</td>
                <td className={td}>both</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>DELETE /wallet/v1/binding</code></td>
                <td className={td}>End it, cancel pending approvals</td>
                <td className={td}>both</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>GET /wallet/v1/binding/setup?kind=…</code></td>
                <td className={td}>The owner&apos;s installation transaction</td>
                <td className={td}>personal only</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>GET /wallet/v1/binding/balance</code></td>
                <td className={td}>The ASSET account&apos;s money</td>
                <td className={td}>both</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>GET /wallet/v1/balance?account=asset</code></td>
                <td className={td}>The same answer, on the general endpoint</td>
                <td className={td}>both</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>POST /wallet/v1/binding/transfer</code></td>
                <td className={td}>Spend the asset account, simple form</td>
                <td className={td}>both</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>POST /wallet/v1/binding/events</code></td>
                <td className={td}>Partner lifecycle news</td>
                <td className={td}>lease only</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>GET /wallet/v1/binding/events</code></td>
                <td className={td}>Which account zones the webhook may name</td>
                <td className={td}>lease only</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>POST /wallet/v1/call</code></td>
                <td className={td}>Spend the asset account, full envelope</td>
                <td className={td}>both</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>GET /wallet/v1/address</code></td>
                <td className={td}>
                  The executor&apos;s address, plus <code className={code}>asset_account_id</code>{' '}
                  and <code className={code}>executor_account_id</code> — both always present for{' '}
                  <code className={code}>chain=near</code>, <code className={code}>null</code> when
                  there is no binding
                </td>
                <td className={td}>—</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>POST /call/&#123;owner&#125;/&#123;project&#125;</code></td>
                <td className={td}>Run a job under the bound name</td>
                <td className={td}>both</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-xl font-semibold mb-2 mt-8">PUT /wallet/v1/binding</h3>
        <p className="text-foreground mb-3">
          Records the binding. It authorizes nothing on its own: what a bound agent may do lives on
          chain, and this row only says which wallet is allowed to ask.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead className="bg-card-muted">
              <tr>
                <th className={th}>Field</th>
                <th className={th}><code className={code}>hos_lease</code></th>
                <th className={th}><code className={code}>personal_account</code></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}><code className={code}>asset_account_id</code></td>
                <td className={td} colSpan={2}>Required. The account the agent will act as.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>kind</code></td>
                <td className={td} colSpan={2}>
                  Optional. Defaults to <code className={code}>hos_lease</code>, because the
                  partner&apos;s own calls carry no kind.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>owner_account_id</code></td>
                <td className={td}>
                  Required. The value House of Stake gave you at provisioning; relayed, stored, and
                  checked for shape only. It is not returned — see below.
                </td>
                <td className={td}>
                  Optional; if sent it must equal <code className={code}>asset_account_id</code>,
                  because in this mode the owner IS the account.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>impl_version</code></td>
                <td className={td}>Required, and gated against the versions this build can decode.</td>
                <td className={td}>
                  <strong>Rejected.</strong> This mode is versioned by the account&apos;s code hash,
                  which you do not declare. Rejected rather than ignored: sending it means the two
                  modes have been confused, and silence would hide that.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-foreground mb-4">
          <strong>A repeat PUT is idempotent, but only for the SAME binding.</strong> Naming a
          different asset account is refused rather than silently rebinding, and so is stating a
          different <code className={code}>impl_version</code>: the recorded version is what selects
          the decoder, and it is written once. To move a binding to a new implementation version,{' '}
          <code className={code}>DELETE</code> it and bind again. Both refusals are{' '}
          <code className={code}>409</code>.
        </p>
        <p className="text-foreground mb-4">
          A binding starts <code className={code}>pending</code> and becomes{' '}
          <code className={code}>active</code> when the chain confirms the lane — the executor is in
          the account&apos;s control set, the account is active and unfrozen, the lease has not run
          out. Nothing you PUT can make it active.
        </p>

        <h3 className="text-xl font-semibold mb-2 mt-8">GET /wallet/v1/binding</h3>
        <p className="text-foreground mb-3">
          Re-reads the chain and answers with the current state. This is the endpoint to poll.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead className="bg-card-muted">
              <tr>
                <th className={th}>Field</th>
                <th className={th}>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}><code className={code}>binding_status</code></td>
                <td className={td}>
                  <code className={code}>pending</code> · <code className={code}>active</code> ·{' '}
                  <code className={code}>suspended</code> ·{' '}
                  <code className={code}>revoked</code>. Only <code className={code}>active</code>{' '}
                  runs. <code className={code}>suspended</code> is reversible and returns on its own
                  once the chain agrees again; <code className={code}>revoked</code> is over.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>executor_account_id</code></td>
                <td className={td}>The account that signs, and the one that needs gas.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>gas_balance</code></td>
                <td className={td}>
                  The executor&apos;s native balance, yoctoNEAR. <strong>Absent</strong> when the
                  node would not answer — a balance nobody could read is not a balance of zero, and
                  is never reported as one.
                </td>
              </tr>
              <tr>
                <td className={td}>
                  <code className={code}>gas_balance_low</code>,{' '}
                  <code className={code}>gas_balance_threshold</code>
                </td>
                <td className={td}>
                  A computed flag and the figure behind it, so whoever funds the executor learns it
                  is time without having to know our gas arithmetic. There is no low-gas webhook:
                  you are already polling this endpoint.
                </td>
              </tr>
              <tr>
                <td className={td}>
                  <code className={code}>impl_version</code>,{' '}
                  <code className={code}>decoder_version</code>
                </td>
                <td className={td}>Lease mode only. Absent for a personal binding, which has no implementation version.</td>
              </tr>
              <tr>
                <td className={td}><em>no owner field</em></td>
                <td className={td}>
                  Deliberately. <code className={code}>owner_account_id</code> is accepted at PUT as
                  the provisioning receipt House of Stake hands you, and stored — but it is checked
                  for shape only and compared against nothing, so returning it would present your
                  own input as an established fact. Who holds a leased account is{' '}
                  <code className={code}>nft_item_info.owner_id</code> on chain, and what ends a
                  lane when it changes hands is the rotation pin: the chain&apos;s number, not
                  anybody&apos;s claim.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-xl font-semibold mb-2 mt-8">GET /wallet/v1/binding/setup?kind=personal_account</h3>
        <p className="text-foreground mb-4">
          Assembles the installation transaction for an account you own: one transaction, three
          actions, signer and receiver both your own account. We only assemble it — you sign it with
          any wallet. The response carries{' '}
          <code className={code}>code_hash</code> (the global contract the first action references,
          the same artifact the verifier pins) and{' '}
          <code className={code}>transactions[]</code>. An account that already runs code is
          refused, because deploying over it would not clear the old contract&apos;s state.
        </p>
        <p className="text-foreground mb-4">
          For <code className={code}>kind=hos_lease</code> this answers{' '}
          <code className={code}>400</code>. Those accounts are provisioned by the partner and
          nobody signs a setup transaction — asking for one means you are in the wrong mode.
        </p>

        <h3 className="text-xl font-semibold mb-2 mt-8">POST /wallet/v1/binding/transfer</h3>
        <p className="text-foreground mb-3">
          A builder, not a second lane. What gets signed is exactly the envelope you could have
          posted to <code className={code}>/wallet/v1/call</code> yourself: same signed object, same
          pre-flight, same grant rules, same policy, same approval trigger. It exists so that
          getting a nested base64 envelope slightly wrong is not the normal experience.
        </p>
        <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm mb-4">
{`{
  "to":     "friend.near",      // the LOGICAL recipient — not the token contract
  "amount": "1000000000000000000000000",
  "token":  "usdc.near",        // optional; absent = native NEAR
  "memo":   "invoice 41"        // optional
}`}
        </pre>
        <p className="text-foreground mb-4">
          Amounts of the money a wallet MOVES are always the token&apos;s smallest unit as a decimal
          string — yoctoNEAR for native, and no fractional form. The exception is money denominated
          in dollars rather than in a token: <code className={code}>initial_deposit_usdc</code> on{' '}
          <code className={code}>/wallet/v1/create-payment-key</code> is written the way a price is
          written, <code className={code}>&quot;2.00&quot;</code>. Nothing on this page is a price.
        </p>

        <h3 className="text-xl font-semibold mb-2 mt-8">POST /wallet/v1/binding/events</h3>
        <p className="text-foreground mb-3">
          Lifecycle news from the partner, authorized by{' '}
          <code className={code}>X-Binding-Webhook-Secret</code>. Deliberately powerless:
        </p>
        <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm mb-4">
{`{ "asset_account_id": "alpha.partner.near", "event": "revoked" }
→ { "binding_status": "revoked" }   // or "suspended", "active", "unbound"`}
        </pre>
        <ul className="list-disc pl-6 space-y-2 text-foreground mb-4">
          <li>
            <strong>The body is a hint, not an instruction.</strong> A{' '}
            <code className={code}>revoked</code> event revokes nothing. We drop the cached
            observation, re-read the chain, and the chain decides. A leaked secret must not become
            the ability to switch off an agent by name.
          </li>
          <li>
            <strong>Only leased bindings are reachable</strong>, and only accounts inside the
            configured zones. An account outside them answers{' '}
            <code className={code}>unbound</code> rather than an error, so the webhook cannot be used
            to probe which accounts we know about. <code className={code}>GET</code> the same path
            with the same secret to read the zones you may name.
          </li>
          <li>
            <strong>Cancelling pending approvals is the part only we can do.</strong> Nothing on
            chain would ever tell us to, so a binding this call finds revoked cleans them up exactly
            as <code className={code}>DELETE</code> does. That is the real reason this endpoint
            exists.
          </li>
        </ul>
        <p className="text-foreground">
          A deployment with no secret configured answers <code className={code}>503</code> — the same
          answer for a correct secret and a wrong one, so a caller cannot tell &quot;not
          configured&quot; from &quot;not authorized&quot; by the response.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="running-as" className="mb-10 scroll-mt-4">
        <AnchorHeading id="running-as">Running a job under the bound name</AnchorHeading>
        <p className="text-foreground mb-4">
          Set <code className={code}>use_bound_identity</code> and the guest runs as the bound
          account. Two doors, and they must answer identically:
        </p>
        <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm mb-4">
{`POST /call/{owner}/{project}
X-Payment-Key: <a key the wallet owns>
{ "input": {...}, "use_bound_identity": true }

# or on chain
request_execution({ ..., use_bound_identity: true })`}
        </pre>
        <p className="text-foreground mb-4">
          Over HTTPS the binding is found through the wallet the payment key names; on chain it is
          found by the calling account, because that is all an on-chain request carries. A key that
          names no wallet, or a wallet with no <code className={code}>active</code> binding, is
          refused before anything is charged.
        </p>
        <p className="text-foreground mb-4">
          What travels is a <strong>claim</strong>. The worker re-verifies it against the chain
          inside the enclave before setting the guest&apos;s environment, and refuses the job if the
          chain disagrees. Billing never moves: the paying key stays the payer throughout.
        </p>
        <p className="text-foreground">
          <strong>A borrowed name is not a borrowed purse.</strong> The flag changes who the guest
          IS. It does not change whose money it spends or whose limits apply — those stay the
          wallet&apos;s. Binding to an account with a laxer policy does not inherit it.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="one-purse" className="mb-10 scroll-mt-4">
        <AnchorHeading id="one-purse">One wallet is one purse</AnchorHeading>
        <p className="text-foreground mb-4">
          The velocity counters — daily, hourly, monthly, and the hourly transaction count — are kept
          per WALLET and nothing else. A spend made through the HTTPS API and a spend a guest makes
          from inside a job meet the same daily figure. There is no per-door budget and no way to
          get a second one.
        </p>
        <p className="text-foreground mb-4">
          Two consequences worth planning around. A job that spends counts against the same ceiling
          your dashboard calls do, so a busy agent can exhaust a limit an operator thought was
          theirs. And <strong>every request that reached the chain consumes the transaction count,
          whether or not it moved anything</strong> — one moving both NEAR and a token counts twice.
          A request refused before it was sent, by the policy or by a pre-flight, costs nothing.
        </p>
        <p className="text-foreground">
          A refusal names the window it hit (<code className={code}>Daily</code>,{' '}
          <code className={code}>Hourly</code>, <code className={code}>Monthly</code>) and the token,
          with the arithmetic: <code className={code}>spent + amount &gt; limit</code>. Read the
          window before assuming which cap you met.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="refusals" className="mb-10 scroll-mt-4">
        <AnchorHeading id="refusals">Reading a refusal</AnchorHeading>
        <p className="text-foreground mb-4">
          A bound-account refusal is structured, because you route on it:
        </p>
        <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm mb-4">
{`HTTP 403
{
  "error": "agent_connect_denied",
  "class": "receiver_not_granted",
  "terminal": false,
  "message": "...",
  "promise_index": 1,          // which promise in the envelope, when one is to blame
  "additional_violations": 2   // how many further problems the request carries
}`}
        </pre>
        <p className="text-foreground mb-4">
          <strong><code className={code}>terminal</code> is the field that matters most.</strong> An
          agent that retries a spent grant spins forever while its owner is never told to issue a new
          one. Retry a reversible refusal; escalate a terminal one to whoever can change the state on
          chain.
        </p>
        <p className="text-foreground mb-4">
          Only ONE class is reported even when several rules are broken, and{' '}
          <code className={code}>additional_violations</code> says how many more there were. The
          order is deliberate: an expiry answers before a malformed envelope, so nobody is sent to
          fix the shape of a request that no grant would have covered anyway.
        </p>

        <h3 className="text-xl font-semibold mb-2 mt-6">Classes</h3>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead className="bg-card-muted">
              <tr>
                <th className={th}>Class</th>
                <th className={th}>What happened</th>
                <th className={th}>Do</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}><code className={code}>executor_not_in_control_set</code></td>
                <td className={td}>The account no longer lets this executor act for it.</td>
                <td className={td}>Ask the account&apos;s owner to re-enable the extension.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>account_frozen</code></td>
                <td className={td}>Frozen by its holder or by an authority.</td>
                <td className={td}>Reversible — wait, or ask for it to be lifted.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>account_not_active</code></td>
                <td className={td}>Listed, settling, suspended or parked.</td>
                <td className={td}>Reversible — the account is mid-lifecycle.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>lease_expired</code></td>
                <td className={td}>The lease ran out.</td>
                <td className={td}><strong>Terminal.</strong> A new lease is a new binding.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>grant_missing</code></td>
                <td className={td}>No spend grant at all.</td>
                <td className={td}>The account&apos;s owner issues one.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>grant_expired</code></td>
                <td className={td}>The grant&apos;s own deadline passed.</td>
                <td className={td}>Ask for a new grant. Retrying will not help.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>grant_exhausted</code></td>
                <td className={td}>The grant&apos;s budget is spent.</td>
                <td className={td}>
                  Re-granting raises the ceiling; the meter keeps its total. Revoking the grant is
                  what resets it.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>receiver_not_granted</code></td>
                <td className={td}>The grant does not name this recipient.</td>
                <td className={td}>Send to a granted receiver, or ask for a wider grant.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>token_not_granted</code>, <code className={code}>token_budget_exceeded</code></td>
                <td className={td}>The grant does not cover this token, or not this much of it.</td>
                <td className={td}>Per-token budgets are separate from the overall one.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>grant_shape_violation:*</code></td>
                <td className={td}>
                  The envelope is not a shape a grant can cover — a method the grant does not allow,
                  an action it never permits (deploying code, adding a key), a call that must stand
                  alone in its promise, a deposit on a call, arguments that will not decode.
                </td>
                <td className={td}>
                  The suffix names which rule. <code className={code}>promise_index</code> names
                  which promise.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>insufficient_vs_reserve</code></td>
                <td className={td}>
                  The spend would leave the account below its own balance floor. The floor tracks
                  live storage, so only the chain knows it.
                </td>
                <td className={td}>Spend less, or the account gets funded.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>unsupported_wallet_implementation</code></td>
                <td className={td}>The account runs a version this build has no decoder for.</td>
                <td className={td}>
                  <strong>Terminal for this build.</strong> We will not sign a nested request we
                  cannot read.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>unrecognized_wallet_code</code></td>
                <td className={td}>
                  The account runs code we do not recognize — a personal account redeployed under
                  us, or a leased account on an implementation we were not told about.
                </td>
                <td className={td}>
                  Reversible. Re-install the supported contract, or tell us the new
                  implementation and we allowlist it; the binding resumes on its own.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>registry_disagrees</code></td>
                <td className={td}>
                  A leased account&apos;s own <code className={code}>nft_item_info</code> and its
                  collection&apos;s <code className={code}>nft_token</code> do not agree — a
                  different owner, a different token, or no such token. The collection has the
                  last word on who owns the account.
                </td>
                <td className={td}>
                  Reversible. The registry may trail the account by a block; if it stays, the
                  account&apos;s owner has changed and a new binding is needed.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>chain_status_unreadable</code></td>
                <td className={td}>
                  The account answered in a shape we cannot read. Schema drift shows up as itself,
                  never as a made-up &quot;lease expired&quot;.
                </td>
                <td className={td}>Reversible. Tell us — it is our decoder, not your call.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>no_bound_identity</code></td>
                <td className={td}>
                  <code className={code}>use_bound_identity</code> was set on a wallet with no active
                  binding, or a key that names no wallet.
                </td>
                <td className={td}>
                  Check <code className={code}>GET /wallet/v1/binding</code>, or drop the flag and
                  run under your own name.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="status-codes" className="mb-10 scroll-mt-4">
        <AnchorHeading id="status-codes">Which failures are worth retrying</AnchorHeading>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border border-border rounded-lg">
            <thead className="bg-card-muted">
              <tr>
                <th className={th}>Status</th>
                <th className={th}>Means</th>
                <th className={th}>Retry?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}><code className={code}>402</code></td>
                <td className={td}>
                  <code className={code}>wallet_underfunded</code> /{' '}
                  <code className={code}>vault_underfunded</code> — it names what is held, what the
                  operation costs, and which account is short.
                </td>
                <td className={td}>After funding that account.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>403</code></td>
                <td className={td}>
                  <code className={code}>agent_connect_denied</code> or{' '}
                  <code className={code}>policy_denied</code>.
                </td>
                <td className={td}>
                  Only if the class says reversible. Read{' '}
                  <code className={code}>terminal</code>.
                </td>
              </tr>
              <tr>
                <td className={td}><code className={code}>409</code></td>
                <td className={td}>
                  <code className={code}>wallet_busy</code> — another operation holds the wallet. The
                  answer carries <code className={code}>in_flight_request_id</code> to poll, or{' '}
                  <code className={code}>in_flight_operation</code> when the id is not yet readable.
                </td>
                <td className={td}>Yes, after the named request finishes.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>422</code></td>
                <td className={td}>
                  <code className={code}>chain_refused</code> — the chain answered about the account
                  and the answer was no.
                </td>
                <td className={td}>No. Nothing changes by asking again.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>503</code> + <code className={code}>Retry-After</code></td>
                <td className={td}>
                  <code className={code}>chain_unavailable</code>,{' '}
                  <code className={code}>keystore_error</code>,{' '}
                  <code className={code}>upstream_unavailable</code> — a node or a service did not
                  answer this second.
                </td>
                <td className={td}>Yes, after the interval given.</td>
              </tr>
              <tr>
                <td className={td}><code className={code}>503</code> without one</td>
                <td className={td}>
                  <code className={code}>service_unavailable</code> — the feature is switched off on
                  this deployment.
                </td>
                <td className={td}>No. Polling is polling forever.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-foreground">
          The presence of <code className={code}>Retry-After</code> is the signal, not the status
          code. Two <code className={code}>503</code>s mean different things and the header is what
          separates them.
        </p>
      </section>

      {/* ─────────────────────────────────────────────────────────────── */}
      <section id="pitfalls" className="mb-4 scroll-mt-4">
        <AnchorHeading id="pitfalls">Things that catch people</AnchorHeading>
        <ul className="list-disc pl-6 space-y-3 text-foreground">
          <li>
            <strong>Amounts are strings in the smallest unit</strong> wherever a token is being
            moved — which is everything on this page. (Dollar figures elsewhere in the API, such as
            a payment key&apos;s <code className={code}>initial_deposit_usdc</code>, are written as
            prices instead.) <code className={code}>&quot;0.2&quot;</code> in a policy limit is not
            0.2 NEAR —
            it is a value we refuse to apply, and the wallet stops signing until it is corrected.
          </li>
          <li>
            <strong>A pending binding authorizes nothing.</strong> Poll{' '}
            <code className={code}>GET /wallet/v1/binding</code> until{' '}
            <code className={code}>active</code>; do not treat a{' '}
            <code className={code}>200</code> from PUT as readiness.
          </li>
          <li>
            <strong>Fund the executor, not the asset account, for gas.</strong> They are different
            accounts and the error messages name which one is short.{' '}
            <code className={code}>gas_balance_low</code> is on the binding read for exactly this.
          </li>
          <li>
            <strong>A refused call still costs the transaction count if it reached the chain.</strong>{' '}
            The cap is transactions, not successful ones — a limiter you could walk past by making
            your own calls fail would not be one.
          </li>
          <li>
            <strong>An empty envelope is a real transaction.</strong>{' '}
            <code className={code}>{'{"request":{}}'}</code>,{' '}
            <code className={code}>{'{"request":[]}'}</code> and{' '}
            <code className={code}>{'{"request":{"external":[]}}'}</code> all decode to a request
            that does nothing, and all three are signed and sent rather than refused. Nothing moves
            and no rule is bypassed — there is nothing to bypass — but the executor pays gas for the
            call and it consumes one slot of the hourly transaction cap like any other call that
            reached the chain.
            <br />
            We do not refuse them, and that is deliberate: the wallet contract runs{' '}
            <code className={code}>nonces.check_cleanup()</code> before it looks at the request, so
            an empty envelope is a supported way to trigger that maintenance without moving value.
            Refusing it would take away an operation the contract offers, to save gas the wallet&apos;s
            own owner is spending. If you are seeing them and did not mean to, the cause is upstream:
            something built an envelope with no actions in it.
          </li>
          <li>
            <strong>The grant and your policy are two ceilings.</strong> Both apply, independently,
            and either can refuse. The grant lives on the account and we cannot change it; the policy
            is yours.
          </li>
        </ul>
      </section>
    </div>
  );
}
