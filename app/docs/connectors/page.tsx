'use client';

import Link from 'next/link';
import { AnchorHeading, useHashNavigation } from '../sections/utils';

/**
 * BUILDING a connector — the author's side.
 *
 * The caller's side lives in "Connectors & Subscriptions": what an operation
 * costs, who gets the share, how subscriptions and trials change the price.
 * This page is the other half, and it was missing: everything a person needs
 * to publish one and nothing about what it earns.
 *
 * Sourced from `docs/CONNECTORS.md` in the near-offshore repo. Where the two
 * disagree, that file is the original.
 */
export default function ConnectorsDocsPage() {
  useHashNavigation();

  return (
    <div className="prose max-w-none">
      <h2 className="text-3xl font-bold mb-6 text-accent-text">Building a Connector</h2>

      <p className="text-foreground mb-6">
        For what a connector <em>costs</em> to call — operation prices, the author&apos;s share,
        subscriptions, trials and the per-wallet quota — see{' '}
        <Link href="/docs/subscriptions" className="text-accent-text underline">
          Connectors &amp; Subscriptions
        </Link>
        . This page is about publishing one.
      </p>

      <div className="space-y-8">
        <section id="what-makes-a-connector">
          <AnchorHeading id="what-makes-a-connector">What makes a project a connector</AnchorHeading>
          <p className="text-foreground">
            <strong>A connector is an ordinary project that was curated and priced.</strong> There is
            no separate runtime, no special deployment and no second API. You write a WASI module and
            publish it like any project; two structural facts make it a connector:
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-2">
            <li>
              it is published under the curated namespace —{' '}
              <code className="bg-card-muted px-1 rounded">connectors.outlayer.near</code> on mainnet,{' '}
              <code className="bg-card-muted px-1 rounded">connectors.outlayer.testnet</code> on
              testnet; and
            </li>
            <li>
              its wasm carries a manifest declaring a{' '}
              <code className="bg-card-muted px-1 rounded">connector_id</code>.
            </li>
          </ul>
          <p className="text-foreground mt-3">
            Membership is a comparison against the owner account of the project id, so &ldquo;is this
            a connector&rdquo; is a fact about where it lives rather than something a project claims
            about itself.
          </p>

          <h3 className="text-lg font-semibold mt-4 mb-2">Why the category exists</h3>
          <p className="text-foreground">
            An ordinary project runs your code for you. A connector runs your code{' '}
            <strong>for somebody else&apos;s agent</strong>, inside a TEE that holds custody keys, and
            lets it reach the internet. Three constraints follow, and they are the whole difference:
          </p>
          <div className="overflow-x-auto mt-3">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left"></th>
                  <th className="px-3 py-2 text-left">ordinary project</th>
                  <th className="px-3 py-2 text-left">connector</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                <tr className="border-b border-border">
                  <td className="px-3 py-2">outbound network</td>
                  <td className="px-3 py-2">open</td>
                  <td className="px-3 py-2"><strong>only the hosts your manifest declares</strong></td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2">operation naming</td>
                  <td className="px-3 py-2">your business</td>
                  <td className="px-3 py-2">a required top-level <code className="bg-card-muted px-1 rounded">operation</code></td>
                </tr>
                <tr>
                  <td className="px-3 py-2">pricing</td>
                  <td className="px-3 py-2">per call</td>
                  <td className="px-3 py-2"><strong>per operation, on chain</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-foreground mt-3">
            It is <strong>not</strong> a plugin or anything running inside another program: your module
            is a normal WASI guest with a normal entry point, and it cannot see other calls, other
            agents&apos; secrets, or the wallet&apos;s keys.
          </p>
        </section>

        <section id="the-call">
          <AnchorHeading id="the-call">The shape of a call</AnchorHeading>
          <p className="text-foreground">Every connector call names its operation in one place:</p>
          <pre className="bg-card-muted p-3 rounded text-sm overflow-x-auto mt-2"><code>{`{ "operation": "send", "to": "someone@example.com", "subject": "hello" }`}</code></pre>
          <p className="text-foreground mt-3">
            Over HTTPS that object is the <code className="bg-card-muted px-1 rounded">input</code> of{' '}
            <code className="bg-card-muted px-1 rounded">POST /call/{'{owner}'}/{'{project}'}</code>;
            on chain it is <code className="bg-card-muted px-1 rounded">input_data</code> in{' '}
            <code className="bg-card-muted px-1 rounded">request_execution</code>. The same bytes
            either way, and four readers take the operation out of them: the contract prices the call,
            the coordinator bills it and picks which limit applies, the worker refuses a connector call
            that names none, and your guest dispatches on it.
          </p>
          <div className="bg-destructive/10 border-l-4 border-red-500 p-4 my-4">
            <p className="text-sm text-foreground">
              <strong>Fail-closed, before your code runs.</strong> Absent, blank, not a string, nested,
              or spelled <code className="bg-destructive/15 px-1 rounded">op</code> — all refused. None
              of them defaults, because a defaulted operation is a defaulted price and the cheapest one
              is what an attacker would pick. An operation with no on-chain price is refused too:
              unpriced is not free.
            </p>
          </div>
          <p className="text-foreground">
            Two format constraints: a priced project&apos;s request must be a JSON object, and on chain
            it must be at most <strong>10 KB</strong> — the contract parses it and the caller&apos;s gas
            pays for that. A connector that moves more than that takes a reference, not the bytes.
          </p>

          <h3 className="text-lg font-semibold mt-4 mb-2">Answering</h3>
          <p className="text-foreground">Return JSON on stdout:</p>
          <pre className="bg-card-muted p-3 rounded text-sm overflow-x-auto mt-2"><code>{`{ "success": true, "output": { }, "logs": [], "error": null }`}</code></pre>
          <p className="text-foreground mt-2">
            The field is <code className="bg-card-muted px-1 rounded">error</code>, not{' '}
            <code className="bg-card-muted px-1 rounded">error_message</code>.
          </p>
        </section>

        <section id="network">
          <AnchorHeading id="network">Network: you declare it, the worker enforces it</AnchorHeading>
          <p className="text-foreground">
            A connector reaches only the hosts listed in{' '}
            <code className="bg-card-muted px-1 rounded">capabilities.network</code> in its manifest.
            Exact hostnames, case-insensitive, <strong>no implicit subdomain wildcard</strong>:{' '}
            <code className="bg-card-muted px-1 rounded">example.com</code> does not permit{' '}
            <code className="bg-card-muted px-1 rounded">evil.example.com</code>.
          </p>
          <p className="text-foreground mt-3">
            The manifest lives in a wasm custom section, so it is covered by the SHA256 the contract
            records for that version. Nobody — not you after publishing, not the operator — can widen
            it without publishing a new version that users have to move to.
          </p>
          <p className="text-foreground mt-3">
            A connector with <strong>no manifest section reaches nothing</strong>. That is the
            fail-closed direction, and <code className="bg-card-muted px-1 rounded">build.sh</code> in{' '}
            <code className="bg-card-muted px-1 rounded">connector-probe</code> fails the build when the
            section is missing, so you find out at your desk rather than in production.
          </p>
          <p className="text-foreground mt-3">
            Every outbound attempt is reported to the coordinator with whether the allowlist permitted
            it. The coordinator stores that trail and <em>decides nothing</em> — enforcement happens
            inside the worker, where the keys are.
          </p>
        </section>

        <section id="two-secrets">
          <AnchorHeading id="two-secrets">Three secrets, three owners</AnchorHeading>
          <p className="text-foreground">
            A connector reads secrets exactly as any other project does. What trips connectors up is
            that three credentials belonging to different people meet in one run.
          </p>
          <p className="text-foreground mt-3">
            <strong>Yours (the author&apos;s).</strong> Your SMTP password or upstream API key — the
            same for every caller. Store it under your own account with{' '}
            <code className="bg-card-muted px-1 rounded">store_secrets</code> for the project you
            publish, and name the profile in the manifest embedded in the wasm; the worker decrypts it
            into every run, and the call carries nothing:
          </p>
          <pre className="bg-card-muted p-3 rounded text-sm overflow-x-auto mt-2"><code>{`{ "connector_id": "<id>", "author_secrets": { "profile": "prod" } }`}</code></pre>
          <p className="text-foreground mt-2">
            Its access condition is judged against the real caller, so it is also who may run your
            connector: <code className="bg-card-muted px-1 rounded">AllowAll</code> for everyone, a
            whitelist or DAO role for a circle. Not a connector feature: any project declares one the
            same way &mdash; see{' '}
            <Link href="/docs/secrets#author-secrets" className="text-accent-text underline">
              The author&apos;s secret
            </Link>.
          </p>
          <p className="text-foreground mt-3">
            <strong>The caller&apos;s.</strong> A row the call names with{' '}
            <code className="bg-card-muted px-1 rounded">secrets_ref</code>, gated by the condition its
            owner stored. An owner hands a credential to their agents by storing it once under their own
            account and whitelisting the agents&apos; wallet accounts (optionally until a date); each
            agent names it:
          </p>
          <pre className="bg-card-muted p-3 rounded text-sm overflow-x-auto mt-2"><code>{`{
  "input": { "operation": "send" },
  "secrets_ref": { "account_id": "owner.near", "profile": "gmail" }
}`}</code></pre>
          <p className="text-foreground mt-3">
            <strong>The agent&apos;s.</strong> A credential stored FOR a custody wallet under the{' '}
            <em>wallet&apos;s</em> account and fetched only when the call asks for it with{' '}
            <code className="bg-card-muted px-1 rounded">x-use-owner-secret: true</code> and names
            nothing else. You never hold it — see{' '}
            <Link href="/docs/secrets#agent-secrets" className="text-accent-text underline">
              Secrets left FOR an agent
            </Link>
            .
          </p>
        </section>

        <section id="limits">
          <AnchorHeading id="limits">What can refuse a call to you</AnchorHeading>
          <p className="text-foreground">
            Four independent mechanisms, ANDed — every applicable one must pass, and none of them can
            raise another.
          </p>
          <ul className="list-disc list-inside space-y-2 text-foreground mt-2">
            <li>
              <strong>Price (the contract).</strong> Per operation, with the author&apos;s share and the
              account it pays to. <code className="bg-card-muted px-1 rounded">request_execution</code>{' '}
              refuses a call that does not attach the operation&apos;s exact price. You do not set this
              in your manifest — a manifest may state a <em>recommended</em> price; the on-chain one is
              what is charged.
            </li>
            <li>
              <strong>Operation limits (the coordinator).</strong>{' '}
              <code className="bg-card-muted px-1 rounded">(operation, window, max, who it applies to)</code>.
              Windows are <code className="bg-card-muted px-1 rounded">day</code>/
              <code className="bg-card-muted px-1 rounded">week</code>/
              <code className="bg-card-muted px-1 rounded">month</code>, rolling from first use and{' '}
              <strong>not calendar-aligned</strong> — a calendar month resets for everybody at midnight
              on the 1st, which turns a monthly cap into a stampede.
            </li>
            <li>
              <strong>The per-wallet connector quota</strong>, which grows with the wallet&apos;s age.
            </li>
            <li>
              <strong>The caller&apos;s own money</strong> — balance, allowance, or per-call cap.
            </li>
          </ul>
          <p className="text-foreground mt-3">
            Operation names in the coordinator&apos;s own rules carry the connector id
            (<code className="bg-card-muted px-1 rounded">near-email:send</code>, or a whole-segment
            wildcard <code className="bg-card-muted px-1 rounded">near-email:*</code> — no general
            globbing). In <em>your manifest</em> you write them without it.
          </p>
        </section>

        <section id="before-you-ship">
          <AnchorHeading id="before-you-ship">Before you ship</AnchorHeading>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>The manifest section is present in the built wasm, and declares every host you reach.</li>
            <li>Every operation you dispatch on has a price on chain — an unpriced one can never run.</li>
            <li>Your answer uses <code className="bg-card-muted px-1 rounded">error</code>, not <code className="bg-card-muted px-1 rounded">error_message</code>.</li>
            <li>On-chain input stays under 10 KB.</li>
            <li>Nothing in your output echoes a secret — yours or the caller&apos;s.</li>
          </ul>
          <p className="text-foreground mt-3">
            <code className="bg-card-muted px-1 rounded">wasi-examples/connector-probe</code> in the
            near-offshore repo is a working connector kept deliberately boring: it does nothing useful
            so that everything around a connector can be tested against it.
          </p>
        </section>
      </div>
    </div>
  );
}
