'use client';

import React, { Suspense } from 'react';
import { RequireWallet } from '@/components/ui/require-wallet';
import { ConnectorOwnerPage, More, type ConnectorSpec } from '@/components/connect/ConnectorOwnerPage';
import { mercuryPolicy } from '@/lib/policies/mercury';

/**
 * Connecting a Mercury business bank account. Everything a connector's owner
 * page has to get right — the wallet, the sealed row, the pause before the
 * signature — is `ConnectorOwnerPage`'s; this file is only what is Mercury's.
 *
 * ## What is Mercury's
 *
 * **There is no consent screen.** Mercury issues API tokens from its own
 * settings page, so the owner pastes one here (rule 18 of the shared page). The
 * token is the credential from the moment it is typed, and the page treats it
 * as one: password field, memory only, never echoed.
 *
 * **The token's scope decides how money moves, and cannot be edited later.**
 * *Read + Send Money* sends payments directly, and Mercury then requires an IP
 * allowlist on the token — the addresses the connector calls from, which are
 * OutLayer's enclave nodes, not the owner's. *Read + Send Money with Approval*
 * queues every payment for a human in Mercury's app and needs no allowlist.
 * The page says so BEFORE the paste, because a wrong scope means a new token,
 * not a setting.
 *
 * **Two rules of Mercury's own that decide whether a queued payment ever
 * clears**, and that nothing here can check: the user who approves must not
 * be the user who created the token, and an approval rule must name that
 * approver for the amount — a request no rule covers exists in the API and
 * appears to nobody. Said here once, and repeated by the connector in every
 * queued answer.
 *
 * **Mercury deletes a token unused for 45 days.** The connector's `status` is
 * a use; the connected view says so where the owner reads what to do next.
 *
 * **A sandbox token is a policy switch, nothing more.** Mercury's sandbox is a
 * separate organisation with its own tokens; `sandbox` in the policy sends the
 * connector's calls to the sandbox API and changes nothing else. It is off by
 * default and explained in one collapsed note.
 *
 * **The token never leaves this page except sealed.** The page does not call
 * Mercury: the account is named in the policy by its number, as the owner's
 * Mercury dashboard shows it, and the connector finds it among the accounts
 * the token reaches.
 */

const PROJECTS = {
  testnet: 'connectors.outlayer.testnet/mercury',
  mainnet: 'connectors.outlayer.near/mercury',
} as const;

const TOKEN_PREFIX = 'secret-token:';

const spec: ConnectorSpec = {
  id: 'mercury',
  provider: 'Mercury',
  title: 'Connect Mercury',
  description: 'Let an agent pay, invoice and read from your Mercury business account, under a policy you set and Mercury’s own approval rules.',
  projects: PROJECTS,
  profile: 'mercury',
  credentialKey: 'MERCURY_API_TOKEN',
  policy: mercuryPolicy,
  configured: true,
  notConfigured: '',

  paste: {
    label: 'Mercury API token',
    placeholder: 'secret-token:mercury_…',
    continueLabel: 'Continue with this token',
    help: (
      <>
        From Mercury → <strong>Settings → API Tokens → Custom</strong>. It stays in this tab until you sign; nothing is sent to us.
      </>
    ),
    problem: (value) => {
      if (/\s/.test(value)) return 'A token has no spaces in it — check what was copied.';
      if (!value.startsWith(TOKEN_PREFIX)) return `Mercury tokens start with ${TOKEN_PREFIX} — this does not look like one.`;
      if (value.length < TOKEN_PREFIX.length + 8) return 'That is too short to be a token.';
      return null;
    },
  },

  intro: (
    <>
      <div className="rounded border border-gray-200 p-3 space-y-2">
        <p className="font-medium">Create the token first, in Mercury: Settings → API Tokens → Custom.</p>
        <p>
          Pick its scope with care — a scope cannot be edited afterwards, only replaced by a new token:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Read + Send Money with Approval</strong> — every payment the agent makes waits for a person in Mercury&apos;s app. The
            usual choice, and the safe first one.
          </li>
          <li>
            <strong>Read + Send Money</strong> — payments go out directly, inside your policy. Mercury then requires an IP allowlist on the
            token, and the addresses to allow are OutLayer&apos;s enclave nodes, not yours; the connector names the address to add the
            first time a payment is refused for it.
          </li>
          <li>
            <strong>Read</strong> only — accounts, payees, the ledger and invoices; nothing else, whatever the policy says.
          </li>
        </ul>
      </div>
      <More label="How you keep the agent in check">
        <p>
          Two controls, both yours. The policy below sets limits — how much per payment and per 30 days, to which payees, by which
          rails, whether it may send invoices. And with an Approval token, every payment waits for a person to confirm it in
          Mercury&apos;s app. With an empty policy the agent can only read.
        </p>
      </More>
      <More label="For queued payments to ever clear, two things on Mercury’s side">
        <p>
          The person who approves must be a different Mercury user from the one who created the token — a one-person organisation
          needs a second user.
        </p>
        <p>
          An approval rule under Move money → Approval rules must name that approver for the amounts in question. A request no rule
          covers exists in Mercury&apos;s API and appears to nobody: it is never approved and never refused. Do not name the
          token&apos;s own user as a required approver, or Mercury refuses the request at once.
        </p>
      </More>
      <More label="Test in the sandbox, without real money">
        <p>
          Mercury has a test bank at <strong>sandbox.mercury.com</strong>: a separate sign-up, its own users and tokens, simulated
          money. Create the token there the same way, paste it here, and tick <strong>Sandbox token</strong> in the policy. The
          connector then calls Mercury&apos;s sandbox API; everything else — your limits, the payees, the approvals — works as it
          does with a real account.
        </p>
        <p>
          A sandbox token works only with the switch on, and a production token only with it off; Mercury answers the wrong pair
          with 401. To move from testing to the real account, replace the token and untick the switch.
        </p>
      </More>
      <More label="What the connector can never do">
        <p>
          Reach any host but Mercury&apos;s API — the allowlist is fixed inside the module. Show anyone the token, you included, once it
          is sealed. Pay past your policy or past Mercury&apos;s rules. Use a wire unless you tick that rail by name. Approve its own
          payment: that is a person in Mercury&apos;s app.
        </p>
        <p>
          Operations that carry a third party&apos;s bank details, a customer&apos;s name or your balances refuse to run on chain, where
          input and output are public for ever; they answer over HTTPS only.
        </p>
      </More>
      <More label="What is stored, where, and who can read it">
        <p>
          The token and your policy, encrypted in this browser to a key whose private half exists only inside the keystore enclave, then
          stored on the contract under your account with a rule naming you alone. We cannot read it afterwards, and neither can this
          page. Nobody can use it until you grant an agent, and removing the grant — or the row — ends it. Deleting the token in
          Mercury ends it too, at once.
        </p>
      </More>
    </>
  ),
  connectLabel: 'Continue with this token',
  reconnectLabel: 'Replace the API token',
  reconnectWhy: (
    <p>
      If Mercury deleted the token — it removes one unused for 45 days, and the agent&apos;s <code>status</code> then reports it as
      invalid — if you revoked it, or if you need a different scope, which only a new token can carry. Paste the new one: one
      signature and one transaction; the policy you have stays as it is.
    </p>
  ),
  grantHint: 'Nobody can use it until you grant an agent — and ask the agent to call status now and then: Mercury deletes a token unused for 45 days.',

  statusView: (output) => {
    if (output.token_present === false || output.token_valid === false) {
      const note = typeof output.token_note === 'string' ? output.token_note : 'Mercury did not accept it';
      return { list: { heading: `The stored token no longer works: ${note}. Replace it below.`, values: [] } };
    }
    const count = typeof output.account_count === 'number' ? output.account_count : null;
    const budget = output.budget as { monthly_limit_usd?: number; spent_or_pending_usd?: number; remaining_usd?: number } | undefined;
    const values: string[] = [];
    if (budget && typeof budget.monthly_limit_usd === 'number') {
      values.push(`$${budget.spent_or_pending_usd ?? 0} spent or queued in the last 30 days`);
      values.push(`$${budget.remaining_usd ?? 0} left of $${budget.monthly_limit_usd}`);
    }
    const works = count === null ? 'The token works.' : `The token works and reaches ${count === 1 ? 'one account' : `${count} accounts`}.`;
    const reach = output.sandbox === true ? `Mercury sandbox — no real money moves. ${works}` : works;
    return { list: { heading: values.length > 0 ? `${reach} Budget:` : reach, values } };
  },

  connectedExtra: (
    <p>
      Payments the agent queues are approved in Mercury&apos;s app by a user other than the token&apos;s creator; the connector cannot
      approve them, and neither can this page. To stop everything at once, delete the token in Mercury → Settings → API Tokens.
    </p>
  ),
};

export default function ConnectMercuryPage() {
  return (
    <RequireWallet>
      <Suspense>
        <ConnectorOwnerPage spec={spec} />
      </Suspense>
    </RequireWallet>
  );
}
