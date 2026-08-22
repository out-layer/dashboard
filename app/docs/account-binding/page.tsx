'use client';

import Link from 'next/link';
import { SyntaxHighlighter, vscDarkPlus } from '@/components/ui/syntax';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Agent Connect — letting an agent act under an account it does not own.
 *
 * Its own page rather than a section inside Agent Custody, because it is the
 * one part of custody a NON-developer has to carry out: the account holder
 * signs, and nobody can sign for them. Buried in a 1500-line developer page it
 * was the least findable thing we ask a person to do.
 *
 * Both modes live here. `personal_account` is a user binding their own named
 * account; `hos_lease` is a leased account provisioned by a partner. They are
 * not interchangeable and the differences are load-bearing, so they are stated
 * side by side rather than described one after the other.
 */
export default function AccountBindingPage() {
  useHashNavigation();

  return (
 <div className="max-w-5xl">
 <h1 className="text-4xl font-bold mb-3">Agent Connect</h1>
 <p className="text-lg text-muted-foreground mb-8">
        Let an agent act under an account it does not own — yours, or one leased to it.
 </p>

 <section id="account-binding" className="mb-10 scroll-mt-4">
 <AnchorHeading id="account-binding">Bind Your Own Account</AnchorHeading>

 <p className="text-foreground mb-4">
 By default an agent acts as its own implicit account. Binding lets it act as a <strong>named account you already own</strong> —
 <code className="bg-card-muted px-1 rounded">alice.near</code> instead of a 64-character hex string — while you keep your keys and
 the agent gets only what your policy allows.
        </p>

 <p className="text-foreground mb-4">
 You install a small wallet contract on your own account and add the agent&apos;s <strong>executor</strong> to its extension set.
 That contract is an extra door, not a new owner: your own keys keep signing directly, and you can shut the door at any time with
 one transaction. Nothing here can be done without your signature.
        </p>

 <div className="bg-card-muted border-l-4 border-amber-500 p-4 mb-4">
 <p className="text-sm text-foreground">
 <strong>Installation is nearly free.</strong> The contract is published once, network-wide, as a global contract, and your
 account only <em>references</em> it by hash — you never pay to store the ~278 KB of code. Your setup transaction costs a little
 state, two 1-yoctoNEAR markers and gas. Under 0.1 NEAR is plenty.
          </p>
        </div>

 <h3 className="text-lg font-semibold mt-4 mb-2">Step 1 — record the binding</h3>
 <p className="text-foreground mb-2">
 This returns the <code className="bg-card-muted px-1 rounded">executor_account_id</code> you are about to authorize. It records a
 relationship and authorizes nothing: the status stays <code className="bg-card-muted px-1 rounded">pending</code> until the executor
 is actually in your account&apos;s extension set.
        </p>
        <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: '0.5rem', fontSize: '0.875rem' }}>
{`curl -s -X PUT -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $API_KEY" \\
  -d '{"asset_account_id":"alice.near","kind":"personal_account"}' \\
  "https://api.outlayer.ai/wallet/v1/binding"`}
        </SyntaxHighlighter>

 <h3 className="text-lg font-semibold mt-4 mb-2">Step 2 — get the transaction to sign</h3>
 <p className="text-foreground mb-2">
 OutLayer assembles the payload; you sign it with any wallet. One transaction, three actions: reference the contract by hash,
 initialise it, and add the executor.
        </p>
        <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: '0.5rem', fontSize: '0.875rem' }}>
{`curl -s -H "Authorization: Bearer $API_KEY" \\
  "https://api.outlayer.ai/wallet/v1/binding/setup?kind=personal_account"`}
        </SyntaxHighlighter>

 <div className="bg-card-muted border-l-4 border-accent p-4 my-4">
 <p className="text-sm text-foreground">
 <strong>Or let the person sign it in a browser.</strong> An agent has no way to sign for
 somebody else&apos;s account, so this is the one step it must hand over. Send the owner to{' '}
 <code className="bg-card px-1 rounded">https://app.outlayer.ai/wallet/connect?key=&lt;the agent&apos;s wk_&gt;</code>{' '}
 — the page reads the pending binding, shows every action in the transaction before
 anything is signed, refuses to proceed if the connected wallet is not the account being
 bound, and links straight to the policy editor once it is active. No CLI, no copied
 payloads.
          </p>
        </div>

 <div className="bg-destructive/10 border-l-4 border-red-500 p-4 my-4">
 <p className="text-sm text-foreground">
 <strong>Use an account with no contract on it.</strong> The kit answers <code className="bg-destructive/15 px-1 rounded">409</code> if
 your account already runs one, and that refusal is deliberate: deploying over an existing contract does <strong>not</strong> clear its
 state. The usual victim would be a 2FA or multisig wallet contract. Your tokens, NFTs and staking are never at risk from the deploy
 itself — they live in other contracts — but a wrecked contract on your account is not something we will help you sign.
          </p>
        </div>

 <h3 className="text-lg font-semibold mt-4 mb-2">Step 3 — confirm it went live</h3>
        <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: '0.5rem', fontSize: '0.875rem' }}>
{`curl -s -H "Authorization: Bearer $API_KEY" \\
  "https://api.outlayer.ai/wallet/v1/binding"`}
        </SyntaxHighlighter>
        <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{ borderRadius: '0.5rem', fontSize: '0.875rem' }}>
{`{
  "binding_status": "active",
  "asset_account_id": "alice.near",
  "executor_account_id": "9c3c9e10...",
  "gas_balance": "120000000000000000000000",
  "gas_balance_low": false
}`}
        </SyntaxHighlighter>
 <p className="text-foreground mt-2">
 The executor pays gas for every call it makes on your behalf, so keep a little NEAR on it.
 <code className="bg-card-muted px-1 rounded">gas_balance_low</code> tells you when to top it up, and a
 <code className="bg-card-muted px-1 rounded">binding.gas_low</code> webhook fires once when it crosses the line.
        </p>

 <h3 className="text-lg font-semibold mt-4 mb-2">What the agent can do now</h3>
 <ul className="list-disc list-inside text-foreground space-y-2 mb-4">
 <li>Spend from your account through your policy — the same whitelists, per-transaction caps and velocity limits as any custody wallet.</li>
 <li>Send email as <code className="bg-card-muted px-1 rounded">alice.near@near.email</code> instead of from a hex address.</li>
 <li>Nothing else. Rewiring the account (adding or removing extensions, changing signature mode) is refused outright, whatever the policy says.</li>
        </ul>

 <p className="text-foreground mb-4">
 Your limits are read from what the request <em>actually does</em>, not from what it looks like on the outside. A single request can
 carry several transfers and token moves at once; every recipient, every amount, and every refund destination inside it is checked
 against your rules before anything is signed.
        </p>

 <h3 className="text-lg font-semibold mt-4 mb-2">Turning it off</h3>
 <p className="text-foreground mb-4">
 Remove the executor from your account&apos;s extension set — one transaction, signed by you, no permission needed from us. The lane stops
 at the next call. <code className="bg-card-muted px-1 rounded">DELETE /wallet/v1/binding</code> ends OutLayer&apos;s side of it and cancels
 any approvals still waiting on that account. Redeploying or removing the contract works too.
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
 <td className="px-3 py-2">The provider, before the agent ever sees it</td>
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
 <p className="text-foreground mt-4">
          The consequence worth reading twice: on a <code className="bg-card-muted px-1 rounded">personal_account</code>{' '}
          binding <strong>the policy is the only limit</strong>. There is no on-chain grant behind it
          as there is for a lease, so a binding with no policy means the agent can move everything in
          that account.
 </p>
 </section>

 <section id="hos-lease" className="mb-10 scroll-mt-4">
 <AnchorHeading id="hos-lease">Leased accounts (<code className="bg-card-muted px-1 rounded">hos_lease</code>)</AnchorHeading>
 <p className="text-foreground mb-4">
          Here the account is not yours and never was: a partner provisions it, installs the contract
          and issues a <strong>spend grant</strong> on chain before the agent is bound to it. There is
          no setup transaction for anyone to sign, which is why the setup-kit endpoint answers{' '}
 <code className="bg-card-muted px-1 rounded">400</code> for this mode — asking for one means the
          two modes have been confused.
 </p>
 <p className="text-foreground mb-4">
          Two limits apply at once, and the stricter wins: the owner&apos;s policy, and the on-chain
          grant. A call that the policy would allow is still refused if the grant does not cover it.
 </p>
 <p className="text-foreground mb-4">
          The request shape is stricter too. Under a lease a call must stand alone in its promise,
          carry exactly <strong>1 yoctoNEAR</strong>, set no{' '}
 <code className="bg-card-muted px-1 rounded">refund_to</code>, and name no{' '}
 <code className="bg-card-muted px-1 rounded">approval_id</code>. These are not style rules —
          each one closes a way of smuggling a second effect into a call the grant was checked against.
 </p>
 <div className="bg-card-muted border-l-4 border-amber-500 p-4 mb-4">
 <p className="text-sm text-foreground">
 <strong>Refusals name which rule failed first.</strong> A collection that is not in the grant
            answers <code className="bg-card-muted px-1 rounded">collection_not_granted</code>; one that
            is, with a token outside the fence, answers{' '}
 <code className="bg-card-muted px-1 rounded">item_not_granted</code>. The distinction matters:
            telling an owner to add a token id when the whole collection is missing is advice that
            cannot work.
 </p>
 </div>
 </section>

 <section id="acting-as" className="mb-10 scroll-mt-4">
 <AnchorHeading id="acting-as">Running under the bound name</AnchorHeading>
 <p className="text-foreground mb-4">
          A binding is a capability, not a rename. By default the agent&apos;s calls still run under its
          own name — a WASI guest sees its own wallet account in{' '}
 <code className="bg-card-muted px-1 rounded">NEAR_SENDER_ID</code>, exactly as before any binding
          existed, because connectors derive real things from that name.
 </p>
 <p className="text-foreground mb-4">
          The agent asks for the bound name <strong>per call</strong>, and it works the same on both
          doors — over HTTPS and from a transaction — so one module answers the same question about who
          it is however it was started:
 </p>
 <SyntaxHighlighter language="bash" style={vscDarkPlus} customStyle={{ borderRadius: '0.5rem', fontSize: '0.875rem' }}>
{`curl -s -X POST -H "Content-Type: application/json" \\
  -H "X-Payment-Key: $PAYMENT_KEY" \\
  -d '{"input":{"operation":"send"}, "use_bound_identity": true}' \\
  "https://api.outlayer.ai/call/connectors.outlayer.near/near-email"`}
 </SyntaxHighlighter>
 <p className="text-foreground mt-4">
          On chain the same flag goes in <code className="bg-card-muted px-1 rounded">params</code> of{' '}
 <code className="bg-card-muted px-1 rounded">request_execution</code>. There the binding is matched
          by the <strong>caller of the transaction</strong> — the wallet&apos;s own implicit account — so
          the transaction has to be sent by the wallet itself.
 </p>
 <p className="text-foreground mt-4">
          Billing never follows the name: the call is still paid by the agent&apos;s key, and the earnings
          ledger records the payer rather than the borrowed identity. Asked for and unavailable is a{' '}
 <strong>refusal</strong>, never a quiet fallback to the agent&apos;s own name.
 </p>
 </section>

 <section id="turning-it-off" className="mb-10 scroll-mt-4">
 <AnchorHeading id="turning-it-off">Ending it</AnchorHeading>
 <p className="text-foreground mb-4">
          Remove the executor from the account&apos;s extension set — one transaction, signed by the
          owner, no permission needed from us. The lane stops at the next call.{' '}
 <code className="bg-card-muted px-1 rounded">DELETE /wallet/v1/binding</code> ends OutLayer&apos;s
          side of it and cancels approvals still waiting on that account.
 </p>
 <p className="text-foreground">
          See also{' '}
 <Link href="/docs/agent-custody" className="text-accent-text underline">Agent Custody</Link>{' '}
          for wallets, policies and the rest of the API.
 </p>
 </section>

 </div>
  );
}
