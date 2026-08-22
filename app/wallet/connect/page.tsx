'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { actionCreators, GlobalContractIdentifier } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { bs58Decode } from '@/lib/vault';

/**
 * Let an agent act under YOUR account — the one step only you can take.
 *
 * Agent Connect binds a custody wallet to an account you own, so the agent's
 * calls can run under your name (a connector like near-email then sends from
 * your mailbox rather than from an anonymous wallet). The agent asks for the
 * binding; it stays `pending` and does nothing until you sign one transaction
 * from the account itself. That signature is what this page exists for.
 *
 * Everything the transaction does is visible below before you sign it. There
 * are three actions and no fourth:
 *
 *   1. `UseGlobalContract` — point the account at an audited wallet contract
 *      already on chain, referenced BY HASH. No code is uploaded here, and the
 *      hash is shown so it can be compared against the published one.
 *   2. `w_init` — initialise that contract on your account.
 *   3. `w_execute_extension { add_extension }` — name the agent's executor as
 *      the one account allowed to act. Nothing else is granted.
 *
 * WHAT THIS DOES NOT DO. It grants no allowance and moves no money. What it
 * grants is the ability to act, and on a `personal_account` binding the only
 * limit on that is the policy you set afterwards — there is no on-chain grant
 * behind it. A binding with no policy means the agent can move everything in
 * the account. The page says so, and links to the policy editor, because the
 * party that benefits from the limit being absent should not be the one who
 * has to remember it.
 *
 * YOU CAN END IT WITHOUT US. Removing the executor from the account's
 * extension set is one transaction from your own wallet, needs nobody's
 * permission, and the agent's next call is refused.
 */

interface Binding {
  binding_id?: string;
  wallet_id?: string;
  kind?: string;
  asset_account_id?: string;
  owner_account_id?: string;
  executor_account_id?: string;
  binding_status?: string;
  gas_balance?: string | null;
  gas_balance_low?: boolean | null;
}

interface KitAction {
  type: string;
  code_hash?: string;
  method_name?: string;
  args?: Record<string, unknown>;
  gas?: string;
  deposit?: string;
}

interface Kit {
  code_hash?: string;
  transactions?: Array<{
    signer_id?: string;
    receiver_id?: string;
    actions?: KitAction[];
  }>;
}

function Inner() {
  const searchParams = useSearchParams();
  const { accountId, isConnected, connect, signAndSendTransaction } = useNearWallet();

  // The agent's wallet credential, handed over in the link it gave you. Same
  // convention the rest of the dashboard uses (`/wallet?key=`): it names which
  // wallet is asking, and it is the only thing that can read that wallet's
  // pending binding.
  const [apiKey, setApiKey] = useState('');
  const [binding, setBinding] = useState<Binding | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const k = searchParams.get('key');
    if (k) setApiKey(k);
  }, [searchParams]);

  const coordinator = getCoordinatorApiUrl();

  const load = useCallback(async (): Promise<Binding | null> => {
    if (!apiKey.startsWith('wk_')) return null;
    setError(null);
    try {
      const r = await fetch(`${coordinator}/wallet/v1/binding`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        // A wallet with nothing pending is the ordinary case, not a failure:
        // the agent has to ask first, and only it can.
        setBinding(null);
        setError(body?.message || body?.error || `No binding to sign (HTTP ${r.status}).`);
        return null;
      }
      setBinding(body as Binding);
      return body as Binding;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    return null;
  }, [apiKey, coordinator]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadKit = useCallback(async () => {
    if (!apiKey.startsWith('wk_')) return;
    setError(null);
    try {
      const r = await fetch(
        `${coordinator}/wallet/v1/binding/setup?kind=personal_account`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body?.message || body?.error || `Could not read the setup (HTTP ${r.status}).`);
        return;
      }
      setKit(body as Kit);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [apiKey, coordinator]);

  const assetAccount = binding?.asset_account_id ?? '';
  const wrongAccount = Boolean(isConnected && assetAccount && accountId !== assetAccount);
  const active = binding?.binding_status === 'active';

  /**
   * Sign the kit VERBATIM.
   *
   * The actions are taken from the response and mapped one for one — nothing
   * is added, reordered or filled in from this page's own idea of what a
   * binding should look like. If the coordinator ever asks for an action this
   * mapping does not know, the signing is refused rather than silently
   * dropping it, because a partially-signed setup is an account that looks
   * bound and is not.
   */
  const sign = useCallback(async () => {
    if (!kit?.transactions?.length) return;
    const tx = kit.transactions[0];
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const actions = (tx.actions ?? []).map((a) => {
        if (a.type === 'UseGlobalContract') {
          if (!a.code_hash) throw new Error('UseGlobalContract without a code_hash');
          return actionCreators.useGlobalContract(
            new GlobalContractIdentifier({ CodeHash: bs58Decode(a.code_hash) }),
          );
        }
        if (a.type === 'FunctionCall') {
          if (!a.method_name) throw new Error('FunctionCall without a method_name');
          return actionCreators.functionCall(
            a.method_name,
            new TextEncoder().encode(JSON.stringify(a.args ?? {})),
            BigInt(a.gas ?? '30000000000000'),
            BigInt(a.deposit ?? '1'),
          );
        }
        throw new Error(
          `The setup asks for an action this page cannot build: ${a.type}. ` +
            'Update the dashboard rather than signing a partial setup.',
        );
      });

      await signAndSendTransaction({ receiverId: tx.receiver_id ?? assetAccount, actions });
      setNote('Signed. Waiting for the binding to go active…');

      // Activation is observed from the chain, so it is not instant. The
      // returned value is what decides — `binding` here is the render's
      // snapshot and never changes inside this loop.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const fresh = await load();
        if (fresh?.binding_status === 'active') break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [kit, signAndSendTransaction, assetAccount, load]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Let an agent act as you"
        description="An agent has asked to run under your account. It cannot until you sign, from that account, the one transaction below."
      />

      <label className="mt-6 block">
        <span className="text-sm text-muted">The agent&apos;s key (from the link it gave you)</span>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value.trim())}
          placeholder="wk_…"
          className="mt-1 w-full rounded border border-card-border bg-card px-3 py-2 font-mono text-sm"
        />
      </label>

      {error && (
        <p className="mt-4 rounded border border-card-border bg-card-muted px-3 py-2 text-sm">{error}</p>
      )}

      {binding && (
        <div className="mt-6 rounded border border-card-border bg-card p-4 text-sm">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-1">
            <dt className="text-muted">Your account</dt>
            <dd className="font-mono">{binding.asset_account_id || '—'}</dd>
            <dt className="text-muted">Agent&apos;s executor</dt>
            <dd className="break-all font-mono">{binding.executor_account_id || '—'}</dd>
            <dt className="text-muted">Status</dt>
            <dd>{binding.binding_status || '—'}</dd>
          </dl>
        </div>
      )}

      {active && (
        <div className="mt-6 rounded border border-card-border bg-card p-4 text-sm">
          <p className="font-medium">This account is bound, and the agent can spend from it now.</p>
          <p className="mt-2">
            There is no limit on that beyond the balance itself until you set one — a daily cap, a
            list of addresses it may send to, or approval above some amount.
          </p>
          <Link className="mt-3 inline-block underline" href={`/wallet?key=${encodeURIComponent(apiKey)}`}>
            Set a policy →
          </Link>
          <p className="mt-3 text-muted">
            To end it: remove the executor from this account&apos;s extension set. One transaction from
            your own wallet, no permission from OutLayer, and the agent&apos;s next call is refused.
          </p>
        </div>
      )}

      {!active && binding && (
        <>
          {!isConnected && (
            <button onClick={connect} className="mt-6 rounded bg-accent px-4 py-2 text-sm">
              Connect {binding.asset_account_id || 'your account'}
            </button>
          )}

          {wrongAccount && (
            <p className="mt-4 rounded border border-card-border bg-card-muted px-3 py-2 text-sm">
              You are connected as <span className="font-mono">{accountId}</span>, but this binding is
              for <span className="font-mono">{assetAccount}</span>. Only that account can sign it —
              switch wallets.
            </p>
          )}

          {isConnected && !wrongAccount && (
            <>
              {!kit && (
                <button onClick={loadKit} className="mt-6 rounded bg-accent px-4 py-2 text-sm">
                  Show me what I would sign
                </button>
              )}

              {kit && (
                <div className="mt-6 rounded border border-card-border bg-card p-4 text-sm">
                  <p className="font-medium">One transaction, {kit.transactions?.[0]?.actions?.length ?? 0} actions</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">
                    {(kit.transactions?.[0]?.actions ?? []).map((a, i) => (
                      <li key={i}>
                        {a.type === 'UseGlobalContract' ? (
                          <>
                            Point this account at the audited wallet contract, by hash{' '}
                            <code className="break-all">{a.code_hash}</code> — no code is uploaded.
                          </>
                        ) : (
                          <>
                            Call <code>{a.method_name}</code>
                            {a.method_name === 'w_execute_extension'
                              ? ' — this is the action that names the agent as allowed to act.'
                              : ' — initialise the contract.'}
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 rounded border border-card-border bg-card-muted px-3 py-2">
                    Signing grants the ability to act, not an amount. Until you set a policy, the only
                    limit is the balance in this account.
                  </p>
                  <button
                    onClick={sign}
                    disabled={busy}
                    className="mt-4 rounded bg-accent px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {busy ? 'Signing…' : 'Sign and bind'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {note && <p className="mt-4 text-sm text-muted">{note}</p>}

      {!binding && !error && apiKey.startsWith('wk_') && (
        <p className="mt-6 text-sm text-muted">Reading the request…</p>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-8">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}
