'use client';

import Link from 'next/link';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Agent Connect — leased agent accounts, the House of Stake integration.
 *
 * Split out of the binding page because the name is theirs and the mechanics
 * are not ours: the account is provisioned by a partner, the spend ceiling
 * lives in an on-chain grant rather than in our policy, and the request shape
 * a lease accepts is stricter than anything a personal binding requires.
 * Kept side by side under one heading, readers looking for "bind my own
 * account" landed on partner mechanics and concluded neither applied to them.
 */
export default function AgentConnectPage() {
  useHashNavigation();

  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl font-bold mb-3">Agent Connect</h1>
      <p className="text-lg text-muted-foreground mb-6">
        Leased agent accounts — an account a partner provisions, funds and lends to an agent under an
        on-chain spend grant.
      </p>

      <div className="bg-card-muted border-l-4 border-amber-500 p-4 mb-8">
        <p className="text-sm text-foreground">
          <strong>Status.</strong> Agent Connect is the House of Stake lease programme. The lane is
          implemented end to end — binding, decoding, grant enforcement and refusal classes — and its
          rules are derived from the published{' '}
          <code className="bg-card px-1 rounded">hos-wallet</code> contract source. It has not yet
          been exercised against a partner-provisioned account, so treat the shapes below as the
          contract we enforce rather than as a walkthrough you can run today. If you want an agent to
          act as an account <em>you</em> own, you want{' '}
          <Link href="/docs/account-binding" className="text-accent-text underline">
            Personal Account Binding
          </Link>{' '}
          instead — that mode is live.
        </p>
      </div>

      <section id="leases" className="mb-10 scroll-mt-4">
        <AnchorHeading id="leases">What a lease is</AnchorHeading>
        <p className="text-foreground mb-4">
          The account is not yours and never was. A partner provisions it, installs the wallet
          contract, and issues a <strong>spend grant</strong> on chain before the agent is bound to
          it. Nobody signs a setup transaction, which is why the setup-kit endpoint answers{' '}
          <code className="bg-card-muted px-1 rounded">400</code> for this mode — asking for one means
          the two modes have been confused.
        </p>
        <p className="text-foreground mb-4">
          Binding it is the same call as any other, with the two fields a lease requires:
        </p>
        <pre className="bg-card border border-border rounded-lg p-4 overflow-x-auto text-sm mb-4">
{`PUT /wallet/v1/binding
{
  "asset_account_id": "agent.tla",
  "kind": "hos_lease",
  "owner_account_id": "partner.near",
  "impl_version": 6
}`}
        </pre>
        <p className="text-foreground">
          The agent&apos;s <strong>executor</strong> — its own implicit account — is what the partner
          grants to, so that is the identifier they need from you before any of this works.
        </p>
      </section>

      <section id="two-modes" className="mb-10 scroll-mt-4">
        <AnchorHeading id="two-modes">Two modes, and they are not interchangeable</AnchorHeading>
        <p className="text-foreground mb-4">
          Which one applies is decided by <strong>who owns the account</strong>, not by preference.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left"></th>
                <th className="px-3 py-2 text-left"><code className="bg-card-muted px-1 rounded">personal_account</code></th>
                <th className="px-3 py-2 text-left"><code className="bg-card-muted px-1 rounded">hos_lease</code></th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border">
                <td className="px-3 py-2">Whose account</td>
                <td className="px-3 py-2">The user&apos;s own <code className="bg-card-muted px-1 rounded">alice.near</code></td>
                <td className="px-3 py-2">A leased, keyless agent account</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2">Who installs the contract</td>
                <td className="px-3 py-2">The user, with one transaction the agent hands them</td>
                <td className="px-3 py-2">The partner, before the agent ever sees it</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2"><code className="bg-card-muted px-1 rounded">impl_version</code> in <code className="bg-card-muted px-1 rounded">PUT</code></td>
                <td className="px-3 py-2"><strong>Rejected</strong> — versioned by the account&apos;s code hash</td>
                <td className="px-3 py-2"><strong>Required</strong></td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2"><code className="bg-card-muted px-1 rounded">owner_account_id</code> in <code className="bg-card-muted px-1 rounded">PUT</code></td>
                <td className="px-3 py-2">Optional; if sent, must equal the asset account</td>
                <td className="px-3 py-2">Required</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2">Spending limits</td>
                <td className="px-3 py-2">The owner&apos;s policy <strong>only</strong></td>
                <td className="px-3 py-2">The owner&apos;s policy <strong>and</strong> an on-chain spend grant</td>
              </tr>
              <tr>
                <td className="px-3 py-2">Setup kit endpoint</td>
                <td className="px-3 py-2">Yes</td>
                <td className="px-3 py-2">No — answers <code className="bg-card-muted px-1 rounded">400</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="grant" className="mb-10 scroll-mt-4">
        <AnchorHeading id="grant">The grant is a second ceiling</AnchorHeading>
        <p className="text-foreground mb-4">
          Two limits apply at once and the stricter wins: the owner&apos;s policy, and the on-chain
          grant. A call the policy would allow is still refused if the grant does not cover it. The
          grant carries a native cap, per-token budgets in that token&apos;s own units, an NFT fence by
          token id, an expiry, and a <code className="bg-card-muted px-1 rounded">reserve_yocto</code>{' '}
          floor the account&apos;s balance may not fall through.
        </p>
        <p className="text-foreground mb-4">
          Three details decide more arguments than the rest of the page put together:
        </p>
        <ul className="list-disc list-inside text-foreground space-y-2 mb-4">
          <li>
            <strong>Re-granting carries the spent total over.</strong> Raising a cap does not hand back
            what was already spent against it — only revoking and issuing a fresh grant resets the
            counter.
          </li>
          <li>
            <strong>The 1 yoctoNEAR marker on a token call is not spend.</strong> It is protocol
            overhead and stays out of the native budget — but it <em>does</em> count against the
            reserve floor, which is measured over every promise in the request.
          </li>
          <li>
            <strong>Ownership rotation ends the binding.</strong> The contract tracks a rotation
            sequence; when the account changes hands the grants are cleared and the binding terminates
            rather than silently following the new owner.
          </li>
        </ul>
        <p className="text-foreground mb-4">
          The <em>policy</em> half has a shape requirement of its own that the grant does not: a
          policy governing this lane must permit <code className="bg-card-muted px-1 rounded">call</code>,
          list the bound account in its address rules, and allow{' '}
          <code className="bg-card-muted px-1 rounded">native</code> — because the lane IS a call, it
          goes through that account, and it carries a 1&nbsp;yoctoNEAR marker. It is written out under{' '}
          <Link href="/docs/account-binding#account-binding" className="text-accent-text underline">
            Bind Your Own Account
          </Link>{' '}
          and applies identically here.
        </p>
        <p className="text-foreground">
          Methods are default-deny by name: only{' '}
          <code className="bg-card-muted px-1 rounded">transfer</code>,{' '}
          <code className="bg-card-muted px-1 rounded">ft_transfer</code> and{' '}
          <code className="bg-card-muted px-1 rounded">nft_transfer</code> are grantable, and a token
          call&apos;s arguments are parsed strictly — <code className="bg-card-muted px-1 rounded">memo</code>{' '}
          is the only extra field the contract tolerates.
        </p>
      </section>

      <section id="call-shape" className="mb-10 scroll-mt-4">
        <AnchorHeading id="call-shape">A lease accepts a narrower request</AnchorHeading>
        <p className="text-foreground mb-4">
          Under a lease a call must stand alone in its promise, carry exactly{' '}
          <strong>1 yoctoNEAR</strong>, set no{' '}
          <code className="bg-card-muted px-1 rounded">refund_to</code>, and name no{' '}
          <code className="bg-card-muted px-1 rounded">approval_id</code>. These are not style rules —
          each closes a way of smuggling a second effect into a call the grant was checked against.
        </p>
        <p className="text-foreground">
          A promise carrying only transfers is fine and may carry several. The stand-alone rule applies
          to a promise that contains a <em>call</em>: there, the call is all it may contain.
        </p>
      </section>

      <section id="refusals" className="mb-10 scroll-mt-4">
        <AnchorHeading id="refusals">Refusals name which rule failed first</AnchorHeading>
        <p className="text-foreground mb-4">
          Every refusal carries a class, and the shape violations carry a subcode as{' '}
          <code className="bg-card-muted px-1 rounded">class:subcode</code>. The order is the
          contract&apos;s own: a missing or expired grant is decided before any promise is looked at.
        </p>
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left">Class</th>
                <th className="px-3 py-2 text-left">Means</th>
              </tr>
            </thead>
            <tbody className="text-foreground">
              <tr className="border-b border-border"><td className="px-3 py-2"><code>grant_missing</code></td><td className="px-3 py-2">No grant for this executor at all</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>grant_expired</code></td><td className="px-3 py-2">There was one; its expiry has passed</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>grant_unreadable</code></td><td className="px-3 py-2">The grant could not be read — refused, never assumed</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>grant_exhausted</code></td><td className="px-3 py-2">The native cap is spent</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>receiver_not_granted</code></td><td className="px-3 py-2">Money aimed at an account the grant does not name</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>token_not_granted</code></td><td className="px-3 py-2">A token contract the grant does not cover</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>token_budget_exceeded</code></td><td className="px-3 py-2">Covered token, over its budget</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>collection_not_granted</code></td><td className="px-3 py-2">The whole NFT collection is outside the grant</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>item_not_granted</code></td><td className="px-3 py-2">Collection granted, this token id outside the fence</td></tr>
              <tr className="border-b border-border"><td className="px-3 py-2"><code>insufficient_vs_reserve</code></td><td className="px-3 py-2">The request would take the balance below the reserve</td></tr>
              <tr><td className="px-3 py-2"><code>grant_shape_violation</code></td><td className="px-3 py-2">The request form is wrong; the subcode says which rule</td></tr>
            </tbody>
          </table>
        </div>
        <p className="text-foreground">
          The distinction between the two NFT classes is the one worth keeping: telling an owner to add
          a token id when the entire collection is missing is advice that cannot work.
        </p>
      </section>

      <section id="running" className="mb-10 scroll-mt-4">
        <AnchorHeading id="running">Running under the leased name</AnchorHeading>
        <p className="text-foreground mb-4">
          Identical to a personal binding: the agent asks per call with{' '}
          <code className="bg-card-muted px-1 rounded">use_bound_identity</code>, on both the HTTPS and
          the on-chain door, and billing stays with the agent&apos;s own key. See{' '}
          <Link href="/docs/account-binding#acting-as" className="text-accent-text underline">
            Running under the bound name
          </Link>
          .
        </p>
        <p className="text-foreground">
          Ending it is the partner&apos;s side: revoking the grant or letting the lease expire stops the
          lane within <strong>five seconds</strong> — an allow we checked a moment ago is cached for
          that long and a denial is never cached, so five seconds is the bound rather than the usual
          case. A lifecycle webhook from the partner collapses it to the next call. <code className="bg-card-muted px-1 rounded">DELETE /wallet/v1/binding</code> ends
          OutLayer&apos;s side and cancels approvals still waiting on that account.
        </p>
      </section>
    </div>
  );
}
