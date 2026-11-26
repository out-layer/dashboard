'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { KeyPair } from '@near-js/crypto';
import { PageHeader } from '@/components/ui/page-header';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import {
  AGENT_ACCOUNT_DEPOSIT_YOCTO,
  AGENT_KEY_NONCE,
  AGENT_KEY_RECIPIENT,
  WALLET_CONTRACT_CODE_HASH,
  agentKeyMessage,
  agentKeySeed,
  addPageKeyActions,
  createAccountActions,
  fromBase64,
  installAndDropKeysActions,
  isSubAccountName,
  pairText,
  publicKeyOfSeed,
  sealAgentKey,
  sendAsAccount,
  toBase64,
  viewPair,
} from '@/lib/wallet-contract';

/**
 * Set up on-chain custody for an agent: the steps only its owner can take.
 *
 * An agent with on-chain custody keeps its main balance in a wallet contract:
 * a NEAR account that executes a request only under two signatures, the
 * agent's key and a key in OutLayer's enclave. The agent opens a setup and
 * hands its owner a link to this page. Here the owner
 *
 *   1. signs one message, whose signature is the agent's key;
 *   2. creates the agent's account (a sub-account of theirs) or uses their
 *      own, and installs the wallet contract on it with the pair of keys;
 *   3. hands the agent its key, sealed so that only the agent opens it.
 *
 * Nothing opens the wallet by itself: every signature is behind a button
 * whose label says what it does, with what it stores and how to undo it
 * beside it. A refused wallet leaves the page on the same step.
 */

interface Setup {
  wallet_id: string;
  owner: string;
  tee_public_key: string;
  recipient_public_key: string;
  agent_key_request: { message: string; recipient: string; nonce_base64: string };
}

type Where = 'sub-account' | 'own-account';

function Inner() {
  const searchParams = useSearchParams();
  const { accountId, isConnected, connect, signAndSendTransaction, signMessage, network, rpcUrl } = useNearWallet();
  const coordinator = getCoordinatorApiUrl();

  // The token names the setup and lets its holder finish it. It is read from
  // the link once, at the first render.
  const [token] = useState(() => searchParams.get('setup') ?? '');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The choices.
  const [where, setWhere] = useState<Where>('sub-account');
  const [name, setName] = useState('agent');
  const [removeKeys, setRemoveKeys] = useState(false);

  // What each step leaves for the next.
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [pair, setPair] = useState<string | null>(null);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [pageKey, setPageKey] = useState<KeyPair | null>(null);
  const [created, setCreated] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [done, setDone] = useState(false);

  // Take it out of the address bar, the history and any referrer.
  useEffect(() => {
    if (!token) return;
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      // The token still works; it stays in the address bar.
    }
  }, [token]);

  useEffect(() => {
    if (!/^[0-9a-f]{64}$/.test(token)) return;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const r = await fetch(`${coordinator}/wallet/v1/contract/setup/owner`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setSetup(null);
          setError(
            r.status === 404
              ? `This link opens no setup on ${network}: it has expired, was replaced by a newer one, or belongs to the other network. Ask the agent for a new link, or switch the network above.`
              : body?.message || body?.error || `The setup could not be read (HTTP ${r.status}).`,
          );
          return;
        }
        setSetup(body as Setup);
      } catch (e) {
        if (!cancelled) setError(`Could not reach the ${network} API (${e instanceof Error ? e.message : String(e)}).`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, coordinator, network]);

  const owner = setup?.owner ?? '';
  const wrongAccount = !!setup && !!accountId && accountId !== owner;
  const agentAccount = where === 'own-account' ? owner : `${name}.${owner}`;
  const nameOk = where === 'own-account' || isSubAccountName(name);

  const step = useCallback(async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await work();
    } catch (e) {
      // A refused or failed signature leaves every earlier step as it was.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  const deriveKey = () =>
    step('key', async () => {
      if (!setup) return;
      // The page signs the message it computes, never one it is handed.
      const message = agentKeyMessage(setup.owner, setup.wallet_id);
      const request = setup.agent_key_request;
      if (request.message !== message || request.recipient !== AGENT_KEY_RECIPIENT || request.nonce_base64 !== toBase64(AGENT_KEY_NONCE)) {
        throw new Error('The API asks for another message than this page signs. Nothing was signed.');
      }
      const signed = await signMessage({ message, recipient: AGENT_KEY_RECIPIENT, nonce: toBase64(AGENT_KEY_NONCE) });
      if (!signed) throw new Error('The wallet returned no signature.');
      if (signed.accountId !== setup.owner) throw new Error(`The message was signed by ${signed.accountId}, not by ${setup.owner}.`);
      const agentSeed = await agentKeySeed(fromBase64(signed.signature), setup.owner, setup.wallet_id);
      const derived = pairText(await publicKeyOfSeed(agentSeed), setup.tee_public_key);
      setSeed(agentSeed);
      setPair(derived);
      setOwnerKey(signed.publicKey);
      // An account that already runs the wallet contract with this pair has
      // nothing left to install: the key is handed to the agent again.
      if ((await viewPair(rpcUrl, agentAccount)) === derived) {
        setCreated(true);
        setInstalled(true);
      }
    });

  const prepareAccount = () =>
    step('create', async () => {
      if (!ownerKey) return;
      const key = pageKey ?? KeyPair.fromRandom('ed25519');
      setPageKey(key);
      const pagePublicKey = key.getPublicKey().toString();
      await signAndSendTransaction({
        receiverId: agentAccount,
        actions: where === 'own-account' ? addPageKeyActions(pagePublicKey) : createAccountActions(ownerKey, pagePublicKey),
      });
      setCreated(true);
    });

  const install = () =>
    step('install', async () => {
      if (!pair || !pageKey || !ownerKey) return;
      // The owner's own account keeps the owner's key, whatever was chosen for a sub-account.
      const ownerKeyToRemove = where === 'sub-account' && removeKeys ? ownerKey : null;
      await sendAsAccount(
        rpcUrl,
        agentAccount,
        pageKey,
        installAndDropKeysActions(pair, pageKey.getPublicKey().toString(), ownerKeyToRemove),
      );
      if ((await viewPair(rpcUrl, agentAccount)) !== pair) {
        throw new Error(`The transaction was sent, but ${agentAccount} does not answer with the pair of keys yet. Try the next step in a few seconds.`);
      }
      setInstalled(true);
    });

  const handOver = () =>
    step('hand', async () => {
      if (!setup || !seed) return;
      const sealed = await sealAgentKey(setup.recipient_public_key, seed, setup.wallet_id);
      const r = await fetch(`${coordinator}/wallet/v1/contract/setup/owner`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ account_id: agentAccount, sealed_agent_key: toBase64(sealed) }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || body?.error || `The setup was not finished (HTTP ${r.status}).`);
      setDone(true);
    });

  const card = 'mt-6 rounded border border-card-border bg-card p-4 text-sm';
  const button = 'mt-4 rounded bg-accent px-4 py-2 text-sm disabled:opacity-50';
  const warning = 'mt-3 rounded border border-card-border bg-card-muted px-3 py-2';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Set up on-chain custody for an agent"
        description="The agent keeps its main balance in a wallet contract on NEAR, which moves nothing without two signatures: the agent's and one from OutLayer's enclave, given only within your policy."
      />

      {!token && (
        <p className="mt-6 text-sm text-muted">
          This page is opened from the link an agent gives its owner. Ask the agent to open a setup and send you the link.
        </p>
      )}

      {error && <p className="mt-4 rounded border border-card-border bg-card-muted px-3 py-2 text-sm">{error}</p>}

      {token && !setup && !error && <p className="mt-6 text-sm text-muted">Reading the setup…</p>}

      {setup && (
        <div className={card}>
          <dl className="grid grid-cols-[11rem_1fr] gap-y-1">
            <dt className="text-muted">Owner</dt>
            <dd className="font-mono">{setup.owner}</dd>
            <dt className="text-muted">Agent&apos;s OutLayer wallet</dt>
            <dd className="break-all font-mono">{setup.wallet_id}</dd>
            <dt className="text-muted">Enclave&apos;s key for it</dt>
            <dd className="break-all font-mono">{setup.tee_public_key}</dd>
            <dt className="text-muted">Network</dt>
            <dd>{network}</dd>
          </dl>
        </div>
      )}

      {setup && !isConnected && (
        <button onClick={connect} className={button}>
          Connect {setup.owner}
        </button>
      )}

      {wrongAccount && (
        <p className="mt-4 rounded border border-card-border bg-card-muted px-3 py-2 text-sm">
          You are connected as <span className="font-mono">{accountId}</span>, but this agent&apos;s owner is{' '}
          <span className="font-mono">{owner}</span>. Only the owner sets it up: switch wallets.
        </p>
      )}

      {setup && isConnected && !wrongAccount && !done && (
        <>
          <div className={card}>
            <p className="font-medium">1. Which account is the agent&apos;s</p>
            <label className="mt-3 flex items-start gap-2">
              <input type="radio" checked={where === 'sub-account'} disabled={created} onChange={() => setWhere('sub-account')} />
              <span>
                A new account for the agent:{' '}
                <input
                  value={name}
                  disabled={created}
                  onChange={(e) => setName(e.target.value.trim().toLowerCase())}
                  className="w-32 rounded border border-card-border bg-card px-2 py-0.5 font-mono"
                />
                <span className="font-mono">.{owner}</span>
                <span className="block text-muted">
                  Created with {(Number(AGENT_ACCOUNT_DEPOSIT_YOCTO / BigInt(1e21)) / 1000).toString()} NEAR from your account for its storage.
                </span>
              </span>
            </label>
            <label className="mt-2 flex items-start gap-2">
              <input type="radio" checked={where === 'own-account'} disabled={created} onChange={() => setWhere('own-account')} />
              <span>
                My own account, <span className="font-mono">{owner}</span>
                <span className="block text-muted">
                  The wallet contract is installed on the account you are signing with. Your own key stays on it and acts
                  on it directly, as it does today. The agent acts as this account toward every contract its policy lets
                  it call.
                </span>
              </span>
            </label>
            {!nameOk && <p className={warning}>A name is lowercase letters and digits, with single - or _ between them.</p>}

            {where === 'sub-account' && (
              <>
                <p className="mt-4 font-medium">Your key on the agent&apos;s account</p>
                <label className="mt-2 flex items-start gap-2">
                  <input type="radio" checked={!removeKeys} disabled={installed} onChange={() => setRemoveKeys(false)} />
                  <span>
                    Keep my key on it
                    <span className="block text-muted">
                      You can act on the account at any time with your own wallet. A key of an account is above its
                      contract: whoever holds yours moves everything on this account at once, and no policy applies to
                      it.
                    </span>
                  </span>
                </label>
                <label className="mt-2 flex items-start gap-2">
                  <input type="radio" checked={removeKeys} disabled={installed} onChange={() => setRemoveKeys(true)} />
                  <span>
                    Remove every key from it
                    <span className="block text-muted">
                      Nothing moves without the agent&apos;s signature and the enclave&apos;s. You alone act on it only
                      through the owner&apos;s exit, after its window. This cannot be undone.
                    </span>
                  </span>
                </label>
              </>
            )}
          </div>

          <div className={card}>
            <p className="font-medium">2. The agent&apos;s key</p>
            <p className="mt-2">
              You sign one message with your own key. The signature is not sent anywhere: this page turns it into the
              agent&apos;s key. Your wallet makes the same signature again whenever you ask, so the key needs no backup
              and you can always derive it yourself.
            </p>
            <p className={warning}>
              Whoever receives this signature holds the agent&apos;s key. Sign this message on app.outlayer.ai only.
            </p>
            {pair ? (
              <p className="mt-3 break-all">
                The pair of keys the contract will require: <code>{pair}</code>
              </p>
            ) : (
              <button onClick={deriveKey} disabled={!!busy || !nameOk} className={button}>
                {busy === 'key' ? 'Waiting for the wallet…' : 'Sign the message that is the agent’s key'}
              </button>
            )}
          </div>

          {pair && (
            <div className={card}>
              <p className="font-medium">3. The wallet contract</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  {where === 'sub-account' ? (
                    <>
                      Your wallet creates <code>{agentAccount}</code> with its NEAR, your own key and a key this page holds
                      for the next action alone.
                    </>
                  ) : (
                    <>
                      Your wallet adds to <code>{agentAccount}</code> a full-access key this page holds for the next
                      action alone. It is made in this tab, stored nowhere, and removed by that action. If you leave before
                      it, the key stays on your account and nobody holds it: remove it in your wallet.
                    </>
                  )}
                </li>
                <li>
                  This page, with that key, points <code>{agentAccount}</code> at the published wallet contract by its hash{' '}
                  <code className="break-all">{WALLET_CONTRACT_CODE_HASH}</code> (no code is uploaded) and initialises it
                  with the pair above
                  {where === 'sub-account' && removeKeys
                    ? ', then removes both keys from the account.'
                    : ', then removes its own key; yours stays.'}
                </li>
              </ol>
              <p className="mt-3 text-muted">
                The contract has no extension and takes no other signer. To undo it while you hold a key of the account:
                deploy another contract on it, or delete the account, from your own wallet.
              </p>

              {!created && (
                <button onClick={prepareAccount} disabled={!!busy} className={button}>
                  {busy === 'create'
                    ? 'Waiting for the wallet…'
                    : where === 'sub-account'
                      ? `Create ${agentAccount}`
                      : `Add this page’s one-time key to ${agentAccount}`}
                </button>
              )}
              {created && !installed && (
                <button onClick={install} disabled={!!busy} className={button}>
                  {busy === 'install' ? 'Installing…' : `Install the wallet contract on ${agentAccount}`}
                </button>
              )}
              {installed && <p className="mt-3">Installed: {agentAccount} answers with the pair above.</p>}
            </div>
          )}

          {installed && (
            <div className={card}>
              <p className="font-medium">4. Hand the agent its key</p>
              <p className="mt-2">
                The agent&apos;s key is sealed to a one-time key the agent made for this setup, and left for it with the
                name of its account. OutLayer carries the sealed key and cannot open it.
              </p>
              <button onClick={handOver} disabled={!!busy} className={button}>
                {busy === 'hand' ? 'Sending…' : `Give the agent its key and ${agentAccount}`}
              </button>
            </div>
          )}
        </>
      )}

      {done && (
        <div className={card}>
          <p className="font-medium">
            <span className="font-mono">{agentAccount}</span> is the agent&apos;s account.
          </p>
          <p className="mt-2">
            The enclave signs for it only under a policy you stored, so the agent can act once a policy is on chain. Funds
            you send to <span className="font-mono">{agentAccount}</span> move only under both signatures.
          </p>
          <Link className="mt-3 inline-block underline" href="/wallet/manage">
            Set the policy →
          </Link>
          <p className="mt-3 text-muted">
            The agent&apos;s OutLayer wallet pays the gas of each move: keep a little NEAR on it. To take the key back,
            sign the same message again on this page with a new link, or leave through the owner&apos;s exit.
          </p>
        </div>
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
