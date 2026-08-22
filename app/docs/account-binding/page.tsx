'use client';

import Link from 'next/link';
import { SyntaxHighlighter, vscDarkPlus } from '@/components/ui/syntax';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * Personal Account Binding — letting an agent act as a named account its owner
 * already has.
 *
 * Its own page rather than a section inside Agent Custody, because it is the
 * one part of custody a NON-developer has to carry out: the account holder
 * signs, and nobody can sign for them. Buried in a 1500-line developer page it
 * was the least findable thing we ask a person to do.
 *
 * The leased mode (`hos_lease`) lives on /docs/agent-connect. Agent Connect is
 * the partner's name for their programme, and readers arriving here for "bind
 * my own account" were reading partner mechanics.
 */
export default function AccountBindingPage() {
  useHashNavigation();

  return (
 <div className="max-w-5xl">
 <h1 className="text-4xl font-bold mb-3">Personal Account Binding</h1>
 <p className="text-lg text-muted-foreground mb-8">
        Let an agent act as a named account you already own, while you keep the keys.
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
 OutLayer assembles the payload; you sign it yourself. One transaction, three actions: reference the contract by hash,
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

 <div className="bg-card-muted border-l-4 border-accent p-4 my-4">
 <p className="text-sm text-foreground">
 <strong>Not every wallet can sign it.</strong> Referencing the contract by hash is the{' '}
 <code className="bg-card px-1 rounded">UseGlobalContract</code> action (NEP-591), and most
 NEAR wallets still have no branch for it &mdash; they refuse with something opaque, or, in
 MyNearWallet&apos;s case, open a sign page that never resolves. <strong>Intear Wallet</strong>{' '}
 signs it on both networks and is what the browser page recommends; the{' '}
 <code className="bg-card px-1 rounded">near-cli</code> connector works too. Signing the
 payload yourself with a NEAR key sidesteps the question entirely.
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

 <div className="bg-destructive/10 border-l-4 border-red-500 p-4 my-4">
 <p className="text-sm text-foreground">
 <strong>Your policy is the only limit here.</strong> A leased account has an on-chain spend grant
 behind it; your own account does not. A binding with no policy on it means the agent can move
 everything in that account — set the policy before you sign, not after.
          </p>
        </div>

 <h3 className="text-lg font-semibold mt-4 mb-2">Turning it off</h3>
 <p className="text-foreground mb-4">
 Remove the executor from your account&apos;s extension set — one transaction, signed by you, no permission needed from us. The lane stops
 at the next call. <code className="bg-card-muted px-1 rounded">DELETE /wallet/v1/binding</code> ends OutLayer&apos;s side of it and cancels
 any approvals still waiting on that account. Redeploying or removing the contract works too.
        </p>
      </section>

 <section id="leased-accounts" className="mb-10 scroll-mt-4">
 <AnchorHeading id="leased-accounts">The other mode: leased accounts</AnchorHeading>
 <p className="text-foreground mb-4">
          Everything above is <code className="bg-card-muted px-1 rounded">kind: "personal_account"</code>{' '}
          — your account, your keys, your policy. There is a second mode,{' '}
 <code className="bg-card-muted px-1 rounded">hos_lease</code>, where a partner provisions the
          account and lends it to an agent under an on-chain spend grant. Nobody signs a setup
          transaction there, the grant is a second ceiling above your policy, and the request shape it
          accepts is narrower.
 </p>
 <p className="text-foreground">
          It has its own page:{' '}
 <Link href="/docs/agent-connect" className="text-accent-text underline">Agent Connect</Link>.
 </p>
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
