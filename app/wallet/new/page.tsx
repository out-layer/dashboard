'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { CopyText } from '@/components/ui/copy-text';
import { AgentChip } from '@/components/ui/agent-chip';
import { InfoHint } from '@/components/ui/info-hint';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { saveWalletKey } from '@/lib/wallet-keys';

/**
 * Create an agent from the browser: one click registers a wallet, shows its
 * API key, saves the key in this browser and leads to the policy page.
 *
 * `POST /register {}` needs no NEAR wallet and no signature, so this page
 * works before the owner connects anything; the policy that makes the agent
 * theirs is set next, on `/wallet/manage?key=…`, where the new wallet appears
 * as the "New Wallet" card.
 *
 * A sponsor code (`spn_…`), if the owner has one, is redeemed right after the
 * registration with the new wallet's own key: the agent then starts with a
 * subscription on its nonce-0 key instead of the trial. A code that is
 * refused does not undo the registration — the agent exists and the answer
 * is shown; the code can be redeemed later from the agent itself.
 *
 * The API key is stored where every other key of this dashboard is stored,
 * `localStorage` (`lib/wallet-keys`). The server keeps only its hash, so the
 * owner is told to keep a copy of their own as well.
 */

interface Registered {
  wallet_id: string;
  api_key: string;
  near_account_id: string;
}

interface Sponsorship {
  payment_key?: string;
  owner: string;
  allowance_usd: string;
  expires_at: string | null;
  sponsor: string;
}

/** Stablecoin minimal units (6 decimals) as dollars. */
function usd(minimal: string): string {
  const n = BigInt(minimal);
  const whole = n / BigInt(1_000_000);
  const cents = (n % BigInt(1_000_000)) / BigInt(10_000);
  return `$${whole}.${cents.toString().padStart(2, '0')}`;
}

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

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<Registered | null>(null);
  const [sponsorship, setSponsorship] = useState<Sponsorship | null>(null);
  /** The code's answer when it was refused: the agent exists all the same. */
  const [codeRefused, setCodeRefused] = useState<string | null>(null);

  // A link that carries the code (`/wallet/new?code=spn_…`, or `/redeem?code=`)
  // fills the field; the owner still clicks.
  // The code leaves the address bar once read: it is a secret of whoever gave it.
  useEffect(() => {
    const fromLink = searchParams.get('code');
    if (fromLink) {
      setCode(fromLink.trim());
      router.replace('/wallet/new');
    }
  }, [searchParams, router]);

  const trimmed = code.trim();
  const codeLooksRight = trimmed === '' || /^spn_[0-9a-f]{16,}$/i.test(trimmed);

  const create = async () => {
    setBusy(true);
    setError(null);
    setCodeRefused(null);
    try {
      const resp = await fetch(`${coordinatorUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok || !body.api_key) {
        throw new Error(body.error || body.message || `Could not create the agent (HTTP ${resp.status})`);
      }
      const made: Registered = {
        wallet_id: body.wallet_id,
        api_key: body.api_key,
        near_account_id: body.near_account_id,
      };
      // Saved before anything else can fail: the key is the one thing that
      // cannot be issued twice.
      if (made.near_account_id) {
        saveWalletKey(`ed25519:${made.near_account_id}`, made.api_key, 'created in the dashboard');
      }
      setRegistered(made);

      if (trimmed) {
        try {
          const r = await fetch(`${coordinatorUrl}/wallet/v1/sponsorship`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${made.api_key}`,
            },
            body: JSON.stringify({ code: trimmed }),
          });
          const answer = await r.json().catch(() => ({}));
          if (r.ok) {
            setSponsorship(answer as Sponsorship);
          } else {
            setCodeRefused(answer.error || `The code was refused (HTTP ${r.status}).`);
          }
        } catch (err) {
          setCodeRefused(`The code could not be sent: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // The key is already in this browser's storage; the link names the wallet,
  // not the key, so the key stays out of the address bar and its history.
  const manageHref = registered?.near_account_id
    ? `/wallet/manage?wallet=${encodeURIComponent(registered.near_account_id)}`
    : registered
      ? `/wallet/manage?key=${encodeURIComponent(registered.api_key)}`
      : '/wallet/manage';

  return (
    <div className="w-full">
      <PageHeader
        title="New agent"
        description="One click registers a wallet for an agent. The agent gets its API key here; you set its policy next."
      />
      <p className="mb-4 text-xs text-muted-foreground">
        Network: <span className="font-semibold text-foreground">{network}</span> — the key works on
        this network only.
      </p>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}

      {!registered ? (
        <section className="max-w-xl rounded-lg border border-border bg-card p-4 sm:p-6">
          <h2 className="flex items-center text-base font-semibold">
            What is created
            <InfoHint
              className="ml-2"
              text={
                <>
                  A custody wallet with its own NEAR account, held in the TEE, and one API key
                  (<code>wk_…</code>) that runs it. The key is shown once below and saved in this
                  browser. The wallet has no policy yet: until you set one on the next page, the
                  key moves whatever the wallet holds without limits — set it before you fund the
                  wallet.
                </>
              }
            />
          </h2>

          <div className="mt-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                Sponsor code <span className="text-muted-foreground">(optional)</span>
              </span>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
                placeholder="spn_…"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                A code somebody gave you: it puts a subscription on the agent&apos;s key the moment it
                is created, so the agent starts with premium instead of the trial.
                {!codeLooksRight ? ' A code starts with spn_ followed by hex characters.' : ''}
              </span>
            </label>
          </div>

          <button
            type="button"
            disabled={busy || !codeLooksRight}
            onClick={create}
            className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? 'Creating…'
              : trimmed
                ? 'Create the agent and redeem the code'
                : 'Create the agent'}
          </button>
        </section>
      ) : (
        <div className="max-w-xl space-y-4">
          <section className="rounded-lg border-2 border-dashed border-accent bg-card p-4 sm:p-6">
            <h2 className="text-base font-semibold">The agent exists</h2>
            <p className="mt-1 text-xs text-faint-foreground">
              NEAR account:{' '}
              {registered.near_account_id ? (
                <AgentChip account={registered.near_account_id} className="font-mono" />
              ) : (
                <span className="font-mono">{registered.wallet_id}</span>
              )}
            </p>

            <div className="mt-4">
              <span className="text-sm font-medium text-foreground">API key</span>
              <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm break-all">
                <CopyText value={registered.api_key} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Give this to the agent as <code>Authorization: Bearer …</code>. It is saved in this
                browser for the policy page; the server keeps only its hash, so keep a copy of your
                own — it cannot be shown again.
              </p>
            </div>
          </section>

          {sponsorship && (
            <section className="rounded-lg border border-success/30 bg-success/10 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-success-text">
                Sponsored by {sponsorship.sponsor}
              </h2>
              <p className="mt-1 text-sm text-foreground">
                The agent holds a subscription of {usd(sponsorship.allowance_usd)}
                {sponsorship.expires_at ? ` until ${new Date(sponsorship.expires_at).toLocaleDateString()}` : ''}. It pays for its calls to the
                verified integrations; the agent reads the key itself with{' '}
                <code>GET /wallet/v1/payment-key</code>.
              </p>
              {sponsorship.payment_key && (
                <div className="mt-3">
                  <span className="text-sm font-medium text-foreground">Payment key</span>
                  <div className="mt-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm break-all">
                    <CopyText value={sponsorship.payment_key} />
                  </div>
                </div>
              )}
            </section>
          )}

          {codeRefused && (
            <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 sm:p-6">
              <h2 className="text-base font-semibold text-destructive-text">The code was not redeemed</h2>
              <p className="mt-1 text-sm text-foreground">{codeRefused}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The agent exists all the same. Ask whoever gave you the code; the agent can redeem one
                later with <code>POST /wallet/v1/sponsorship</code>.
              </p>
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
            <h2 className="text-base font-semibold">Next: the policy</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A policy names you as the owner and says what the agent may do with the wallet&apos;s
              funds. Until one is set, the agent&apos;s key moves them without limits. Setting it is one
              transaction from your NEAR wallet, on the next page. Trading on Hyperliquid or Polymarket
              has caps of its own: store them at{' '}
              <Link href="/connectors" className="text-accent-text hover:underline">
                verified integrations
              </Link>
              ; without them the agent trades with no caps.
            </p>
            <Link
              href={manageHref}
              className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              Set the policy
            </Link>
          </section>
        </div>
      )}
    </div>
  );
}
