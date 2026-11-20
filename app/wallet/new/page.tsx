'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { saveWalletKey } from '@/lib/wallet-keys';

/**
 * Create an agent wallet: one click registers it, saves its API key in this
 * browser and opens its policy, where the owner connects a NEAR wallet and
 * the key is handed over once the policy is on chain.
 *
 * `POST /register {}` needs no NEAR wallet and no signature, so this page
 * works before the owner connects anything.
 *
 * A sponsor code arrives only in a link (`/redeem?code=spn_…`): it is redeemed
 * right after the registration with the new wallet's own key, and what came of
 * it is told on the policy page. A refused code does not undo the
 * registration.
 *
 * The API key is stored where every other key of this dashboard is stored,
 * `localStorage` (`lib/wallet-keys`). The server keeps only its hash.
 */

/** Stablecoin minimal units (6 decimals) as dollars. */
function usd(minimal: string): string {
  const n = BigInt(minimal);
  const whole = n / BigInt(1_000_000);
  const cents = (n % BigInt(1_000_000)) / BigInt(10_000);
  return `$${whole}.${cents.toString().padStart(2, '0')}`;
}

/** What the owner gets, said before anything is created. */
const FEATURES = [
  {
    title: 'The keys never reach the agent',
    text: 'They stay in a hardware enclave. The agent holds an API key and asks; the enclave signs.',
    icon: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  {
    title: 'It pays only who you approve',
    text: 'Money leaves only to the addresses on your list. A leaked key reaches no one else.',
    icon: (
      <>
        <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.500 7-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    title: 'Your limits, per token',
    text: 'Per payment and per day. Counted for the wallet, so a new key does not reset them.',
    icon: (
      <>
        <path d="M4 18a8 8 0 1 1 16 0" />
        <path d="m12 18 4-6" />
      </>
    ),
  },
  {
    title: 'A new address asks you first',
    text: 'The agent sends you a link. You check the address and sign once; then it can pay.',
    icon: (
      <>
        <path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1" />
      </>
    ),
  },
  {
    title: 'Any chain in, any chain out',
    text: 'One wallet with addresses on NEAR, Ethereum, Solana, Bitcoin and 20+ chains.',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3.500 3 14.500 0 18M12 3c-3 3.500-3 14.500 0 18" />
      </>
    ),
  },
  {
    title: 'You stay the owner',
    text: 'Freeze the wallet, change the rules or replace the key at any time, from your NEAR account.',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.500" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
  },
] as const;

const STEPS = [
  { title: 'Create the wallet', text: 'Free, instant, no sign-up.' },
  { title: 'Sign the rules', text: 'Connect your NEAR account and store the policy with one transaction. It starts protected: money leaves only to you.' },
  { title: 'Hand over the key', text: 'Give the agent its API key. From then on it works inside your rules.' },
] as const;

export default function NewAgentPage() {
  return (
    <Suspense fallback={null}>
      <NewAgentPageContent />
    </Suspense>
  );
}

function NewAgentPageContent() {
  const { network } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const searchParams = useSearchParams();
  const router = useRouter();

  // A code is a secret of whoever gave it: it is read once and leaves the
  // address bar.
  const [code] = useState(() => (searchParams.get('code') ?? '').trim());
  useEffect(() => {
    if (searchParams.get('code')) router.replace('/wallet/new');
  }, [searchParams, router]);
  const codeLooksRight = code === '' || /^spn_[0-9a-f]{16,}$/i.test(code);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`${coordinatorUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body.api_key) {
        throw new Error(body.error || body.message || `Could not create the agent wallet (HTTP ${resp.status})`);
      }
      const apiKey: string = body.api_key;
      const account: string | undefined = body.near_account_id;
      // Saved before anything else can fail: the key is the one thing that
      // cannot be issued twice.
      if (account) saveWalletKey(`ed25519:${account}`, apiKey, 'created in the dashboard');

      if (code && codeLooksRight && account) {
        let note: { ok: boolean; text: string };
        try {
          const r = await fetch(`${coordinatorUrl}/wallet/v1/sponsorship`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ code }),
          });
          const answer = await r.json().catch(() => ({}));
          note = r.ok
            ? {
                ok: true,
                text:
                  `Sponsored by ${answer.sponsor}: the agent holds a subscription of ${usd(String(answer.allowance_usd))}` +
                  `${answer.expires_at ? ` until ${new Date(answer.expires_at).toLocaleDateString()}` : ''}. ` +
                  'It pays for its calls to the verified integrations; the agent reads its payment key itself with GET /wallet/v1/payment-key.',
              }
            : {
                ok: false,
                text: `The sponsor code was not redeemed (${answer.error || `HTTP ${r.status}`}). The agent wallet exists all the same; ask whoever gave you the code.`,
              };
        } catch (err) {
          note = { ok: false, text: `The sponsor code could not be sent: ${(err as Error).message}. The agent wallet exists all the same.` };
        }
        sessionStorage.setItem(`outlayer:sponsorship:${account}`, JSON.stringify(note));
      }

      // The link names the wallet, not the key, so the key stays out of the
      // address bar and its history. A registration that names no account
      // hands the key over once; the policy page stores it and drops it from
      // the address.
      router.push(
        account
          ? `/wallet?wallet=${encodeURIComponent(account)}`
          : `/wallet?key=${encodeURIComponent(apiKey)}`,
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="New agent"
        description="Give your agent a wallet that works like a hardware wallet. If its key leaks, you lose the key, not the money."
      />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">New agent wallet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            For any agent: on Railway or another host, on a server, in Claude Code or Cursor on your machine. The agent
            holds only an API key. Nothing to choose now: you set its rules on the next screen and can change them
            later.
          </p>

          {code && (
            <p className={`mt-4 text-sm ${codeLooksRight ? 'text-foreground' : 'text-destructive-text'}`}>
              {codeLooksRight
                ? 'The sponsor code from your link is redeemed when the wallet is created.'
                : 'The sponsor code in your link is not a code (spn_ followed by hex characters); the wallet is created without it.'}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={create}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create the agent wallet'}
            </button>
          </div>
        </section>

        <ul className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-accent-text">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                  {feature.icon}
                </svg>
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">{feature.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{feature.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <section className="mt-8 border-t border-border pt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">What happens next</h2>
        <ol className="mt-3 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">{step.title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Until the policy is stored the key has no limits. Fund the wallet after step 2, not before.
        </p>
      </section>
    </div>
  );
}
