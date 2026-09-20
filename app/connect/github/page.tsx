'use client';

import React, { Suspense } from 'react';
import { RequireWallet } from '@/components/ui/require-wallet';
import { ConnectorOwnerPage, More, type ConnectorSpec } from '@/components/connect/ConnectorOwnerPage';
import { githubPolicy, githubStartingPolicy } from '@/lib/policies/github';

/**
 * Connecting a GitHub account. Everything a connector's owner page has to get
 * right — the wallet, the sealed row, the callback — is
 * `ConnectorOwnerPage`'s; this file is only what is GitHub's.
 *
 * ## What is GitHub's
 *
 * **Two fences, and the page says which is which.** Which repositories the
 * credential reaches at all is decided on GITHUB, when the owner installs the
 * OutLayer app and picks them; what the agent may do inside those is the policy
 * here. A person who has not been told this picks "All repositories" on GitHub
 * meaning to narrow it later, and the policy cannot widen or replace what
 * GitHub enforces — it can only narrow it.
 *
 * **GitHub's authorisation screen lists only "Gists".** Repository permissions
 * are granted by the installation, not by the authorisation, so the screen a
 * person reads last mentions none of them. Said BEFORE they leave for GitHub:
 * otherwise they come back believing they lent their gists and nothing else.
 *
 * **Authorise first, choose repositories second.** GitHub's installation page
 * redirects back only on the very FIRST install; for an account that has the app
 * already it is a settings page that ends on GitHub, and a person sent there is
 * stranded with nothing stored. Authorisation always comes back — at once, with
 * no screen at all, for someone who authorised before. So "Connect" is the
 * authorisation, and with the token in hand the page asks GitHub what it
 * reaches: when that is nothing, it links to the installation page IN ANOTHER
 * TAB and offers "check again". The token does not change when repositories do.
 *
 * **That other tab comes back here too**, because the app requests authorisation
 * during installation: GitHub redirects it to this page with a `code` the first
 * tab never asked for. It is met with a note — go back to the tab you were in —
 * not with the refusal a stranger's link gets, and the code is left to expire.
 * On an organisation the person does not own GitHub files a REQUEST for its
 * owners instead (`setup_action=request`), and the note says so.
 *
 * **The credential is one token that does not expire**, and there is no author
 * secret: the connector never refreshes anything. `exchange` refuses a token
 * that carries an expiry, because that means the app's setting was changed and
 * the connection would die within hours.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_APP_CLIENT_ID ?? '';
const APP_SLUG = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? '';
const INSTALL_URL = `https://github.com/apps/${APP_SLUG}/installations/new`;

/** Who the token acts as and what it reaches, asked of GitHub from this tab — the token goes nowhere else. */
async function inspect(token: string) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const [user, repos] = await Promise.all([
    fetch('https://api.github.com/user', { headers }).then((r) => (r.ok ? r.json() : null)),
    fetch('https://api.github.com/user/repos?per_page=30&sort=pushed', { headers }).then((r) => (r.ok ? r.json() : [])),
  ]);
  const login: string | null = typeof user?.login === 'string' ? user.login : null;
  const reachable: string[] = Array.isArray(repos) ? repos.map((r) => r?.full_name).filter((n): n is string => typeof n === 'string') : [];
  if (!login) return null;
  const none = reachable.length === 0;
  const reach = none
    ? ''
    : ` It reaches ${reachable.length === 30 ? '30 or more repositories' : reachable.length === 1 ? 'one repository' : `${reachable.length} repositories`}: ${reachable.slice(0, 5).join(', ')}${reachable.length > 5 ? ', …' : ''}.`;
  return {
    label: `Connected as @${login}. Everything the agent does will appear under this name.${reach}`,
    starting: githubStartingPolicy(login, reachable),
    todo: {
      urgent: none,
      text: none
        ? 'It reaches no repository yet: the OutLayer app is not installed on any. Choose them on GitHub — it opens in another tab, and this one keeps your place. (Gists work without it.)'
        : 'Which repositories it reaches is set on GitHub, and can be changed now or later:',
      href: INSTALL_URL,
      linkLabel: none ? 'Choose repositories on GitHub' : 'change repositories',
    },
  };
}

const spec: ConnectorSpec = {
  id: 'github',
  provider: 'GitHub',
  title: 'Connect GitHub',
  description: 'Let an agent work in your GitHub account, under your name and your rules.',
  projects: { testnet: 'connectors.outlayer.testnet/github', mainnet: 'connectors.outlayer.near/github' },
  profile: 'github',
  credentialKey: 'GITHUB_TOKEN',
  policy: githubPolicy,
  configured: Boolean(CLIENT_ID && APP_SLUG),
  notConfigured: 'This deployment has no GitHub App configured, so the connection cannot be started.',

  consentUrl: ({ state, redirectUri }) => {
    // Always the authorisation, never the installation page: this is the trip
    // that comes back whatever the account's history with the app is.
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  },

  // The installation page, opened in another tab from the step above, ends here.
  strayCallback: (params) => {
    const action = params.get('setup_action');
    if (action === 'request') {
      return 'GitHub sent an installation REQUEST to the owners of that organisation — you are not one of them, so those repositories are not reachable yet. You can close this tab; in the tab where you were connecting, press “check again” once an owner has approved it.';
    }
    if (action === 'install' || action === 'update') {
      return 'The repositories are saved on GitHub. You can close this tab — go back to the one where you were connecting and press “check again”.';
    }
    return null;
  },

  callbackRefusal: (params) => {
    const refused = params.get('error');
    if (!refused) return null;
    return refused === 'access_denied'
      ? 'The authorisation was cancelled on GitHub, so nothing was connected.'
      : `GitHub refused the authorisation: ${params.get('error_description') ?? refused}`;
  },

  hasCredentialIn: (params) => Boolean(params.get('code')),

  exchange: async (params, redirectUri) => {
    const exchanged = await fetch('/connect/github/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: params.get('code'), redirect_uri: redirectUri }),
    });
    const answer = await exchanged.json().catch(() => ({}));
    if (!exchanged.ok) throw new Error(answer?.error || `The exchange failed (HTTP ${exchanged.status}).`);
    return answer.token as string;
  },

  inspect,

  intro: (
    <>
      <p>
        Your agent will act <strong>as you</strong>: its issues, comments, commits and reviews carry your name. Two things decide
        what it can do, and you set both.
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          <strong>On GitHub:</strong> which repositories the OutLayer app may touch at all. Pick the few you mean — a repository you do
          not pick does not exist as far as the agent is concerned, and nothing on this page can change that.
        </li>
        <li>
          <strong>Here:</strong> what the agent may do inside those — read, comment, open pull requests — and how much a day.
        </li>
      </ol>
      <p className="text-muted-foreground">
        The button takes you to GitHub to authorise the app and brings you straight back. Its screen lists only &ldquo;Gists&rdquo; —
        that is expected: repositories are chosen separately, and this page shows you which ones it reaches as soon as you return.
      </p>
      <More label="What can it never do, whatever I allow?">
        <p>
          Touch a repository you did not pick; write workflow files; change settings, collaborators, secrets or webhooks — the app is
          not given those permissions, so GitHub refuses them. And the connector itself never writes under <code>.github/</code>,
          never force-pushes, and never deletes a branch, a repository or a gist.
        </p>
      </More>
    </>
  ),
  connectLabel: 'Connect GitHub account',
  reconnectLabel: 'Reconnect the GitHub account',
  reconnectWhy: (
    <p>
      If the token was revoked — the agent reports <code>token_rejected</code> — or you want a different GitHub account. A new
      authorisation, then one signature and one transaction; the policy you have stays as it is.
    </p>
  ),
  grantHint: 'Nobody can use it until you grant an agent.',
  usage: { key: 'writes_today', say: (n) => `${n} write${n === 1 ? '' : 's'} today by you` },
  connectedExtra: (
    <p>
      Which repositories the agent can reach is set on GitHub, not here:{' '}
      <a className="underline" href={INSTALL_URL} target="_blank" rel="noopener noreferrer">
        change repositories
      </a>
      . Nothing has to be stored again afterwards. To stop everything at once, remove the app at GitHub → Settings → Applications.
    </p>
  ),
};

export default function ConnectGitHubPage() {
  return (
    <RequireWallet>
      <Suspense>
        <ConnectorOwnerPage spec={spec} />
      </Suspense>
    </RequireWallet>
  );
}
