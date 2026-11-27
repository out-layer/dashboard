'use client';

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { KeyPair } from '@near-js/crypto';
import { PageHeader } from '@/components/ui/page-header';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import {
  AGENT_ACCOUNT_DEPOSIT_YOCTO,
  AGENT_KEY_NONCE,
  AGENT_KEY_RECIPIENT,
  PAGE_KEY_FUNDING_YOCTO,
  WALLET_CONTRACT_CODE_HASH,
  agentKeyMessage,
  agentKeySeed,
  createAccountActions,
  createDeterministicAccount,
  deterministicAccount,
  fromBase64,
  fundPageKeyActions,
  implicitAccountOf,
  installActions,
  installAndDropKeyActions,
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
 * hands its owner a link to this page. Here the owner takes two steps, each one
 * button:
 *
 *   1. signs one message, whose signature is the agent's key;
 *   2. creates the agent's wallet: by default a new account with no key at its
 *      deterministic address (NEP-616), funded with an ordinary transfer to a
 *      one-time key of this page; or a sub-account of theirs, or their own
 *      account. After the owner's one wallet transaction the page installs the
 *      contract with its one-time key and hands the agent its key, sealed so
 *      that only the agent opens it: neither opens a wallet.
 *
 * A wallet prompt comes only from a click, and the button's label says what it
 * does. A refused wallet leaves the page on the same step. Before every action
 * the setup is asked again, so a link someone else used stops the page.
 */

interface Setup {
  wallet_id: string;
  owner: string;
  tee_public_key: string;
  recipient_public_key: string;
  agent_key_request: { message: string; recipient: string; nonce_base64: string };
}

type Where = 'deterministic' | 'sub-account' | 'own-account';

const near = (yocto: bigint) => (Number(yocto / BigInt(1e21)) / 1000).toString();

const card = 'rounded-lg border border-border bg-card p-4 sm:p-5';
const primary =
  'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50';
const secondary =
  'rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-card-muted disabled:opacity-50';
const more = 'mt-4 text-sm text-muted-foreground [&>summary]:cursor-pointer [&>summary]:select-none';

// The setup token, read from the link's fragment once per page load: the page
// takes it out of the address bar right after, and keeps reading this value.
let tokenOfThisLoad: string | null = null;
const readToken = () => (tokenOfThisLoad ??= new URLSearchParams(window.location.hash.slice(1)).get('setup') ?? '');
const noSubscription = () => () => {};

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs tabular-nums text-muted-foreground">
      {done ? '✓' : n}
    </span>
  );
}

function Inner() {
  const { accountId, isConnected, connect, signAndSendTransaction, signMessage, network, rpcUrl } = useNearWallet();
  const coordinator = getCoordinatorApiUrl();

  // The token names the setup and lets its holder finish it, from the link's
  // fragment (`#setup=`): a fragment is sent to no server, so the token reaches
  // no log, proxy or link preview.
  const token = useSyncExternalStore(noSubscription, readToken, () => null);
  const tokenError =
    token && !/^[0-9a-f]{64}$/.test(token) ? 'This link is not a setup link, or it was cut short. Ask the agent for a new link.' : null;
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [where, setWhere] = useState<Where>('deterministic');
  const [name, setName] = useState('agent');

  // What each step leaves for the next.
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [pair, setPair] = useState<string | null>(null);
  const [ownerKey, setOwnerKey] = useState<string | null>(null);
  const [pageKey, setPageKey] = useState<KeyPair | null>(null);
  const [created, setCreated] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  // Out of the address bar, the history and any referrer once read.
  useEffect(() => {
    if (!token) return;
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {
      // The token still works; it stays in the address bar.
    }
  }, [token]);

  useEffect(() => {
    if (!token || tokenError) return;
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
            r.status === 409
              ? 'This link was used already. If you did not finish it, do not go on: send nothing to the account it named, and ask the agent for a new link.'
              : r.status === 404
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
  }, [token, tokenError, coordinator, network]);

  const owner = setup?.owner ?? '';
  const wrongAccount = !!setup && !!accountId && accountId !== owner;
  const accountFor = (choice: Where, forPair: string | null) =>
    choice === 'own-account' ? owner : choice === 'sub-account' ? `${name}.${owner}` : forPair ? deterministicAccount(forPair) : '';
  const agentAccount = accountFor(where, pair);
  const nameOk = where !== 'sub-account' || isSubAccountName(name);

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

  // Before the owner's wallet sends anything, and before the key is handed
  // over: the setup is still open. A link someone else already used stops
  // here, with nothing sent.
  const requireOpen = async () => {
    const r = await fetch(`${coordinator}/wallet/v1/contract/setup/owner`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (r.ok) return;
    const body = await r.json().catch(() => ({}));
    throw new Error(
      r.status === 409
        ? 'Do not go on: this link was used already. Send nothing to the account it named, and ask the agent for a new link.'
        : body?.message || `The setup could not be read (HTTP ${r.status}). Nothing was sent.`,
    );
  };

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
      if ((await viewPair(rpcUrl, accountFor(where, derived))) === derived) {
        setCreated(true);
        setInstalled(true);
      }
    });

  // With the page's one-time key, after the owner's transaction: the wallet
  // contract on a new account. Opens no wallet.
  const install = async (key: KeyPair) => {
    if (!pair) return;
    await requireOpen();
    if (where === 'deterministic') {
      await createDeterministicAccount(rpcUrl, key, owner, pair);
    } else {
      await sendAsAccount(rpcUrl, agentAccount, key, installAndDropKeyActions(pair, key.getPublicKey().toString(), ownerKey));
    }
    if ((await viewPair(rpcUrl, agentAccount)) !== pair) {
      throw new Error(`${agentAccount} does not answer with the pair of keys yet. Press the button again in a few seconds.`);
    }
    setInstalled(true);
  };

  // The agent's key, sealed to the one-time key the agent made, left with the
  // account's name. Opens no wallet.
  const handOver = async () => {
    if (!setup || !seed) return;
    await requireOpen();
    const sealed = await sealAgentKey(setup.recipient_public_key, seed, setup.wallet_id);
    const r = await fetch(`${coordinator}/wallet/v1/contract/setup/owner`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ account_id: agentAccount, sealed_agent_key: toBase64(sealed) }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.message || body?.error || `The setup was not finished (HTTP ${r.status}).`);
    setDone(true);
  };

  // The one click of step 2: the owner's one wallet transaction, then the
  // page's own work. Pressed again after a failure, it goes on from where it
  // stopped; the wallet is asked again only if its transaction did not go.
  const createWallet = () =>
    step('create', async () => {
      if (!pair) return;
      await requireOpen();
      const own = where === 'own-account';
      const key = own ? null : (pageKey ?? KeyPair.fromRandom('ed25519'));
      if (key) setPageKey(key);
      if (!created) {
        // own account: the install itself; a sub-account: created with the page's
        // key and the owner's; a 0s account: NEAR for the page's key
        const [receiverId, actions] = !key
          ? [agentAccount, installActions(pair)]
          : where === 'sub-account'
            ? [agentAccount, createAccountActions(key.getPublicKey().toString(), ownerKey)]
            : [implicitAccountOf(key), fundPageKeyActions()];
        setBusy('wallet');
        await signAndSendTransaction({ receiverId, actions });
        setCreated(true);
        if (own) {
          if ((await viewPair(rpcUrl, agentAccount)) !== pair) {
            throw new Error(`The transaction was sent, but ${agentAccount} does not answer with the pair of keys yet. Press the button again in a few seconds.`);
          }
          setInstalled(true);
        }
      }
      if (!own && !installed && key) {
        setBusy('install');
        await install(key);
      }
      setBusy('hand');
      await handOver();
    });

  const costOfStep2 =
    where === 'deterministic'
      ? `Your wallet sends ${near(PAGE_KEY_FUNDING_YOCTO)} NEAR for the fees; most of it comes back to you.`
      : where === 'sub-account'
        ? `Your wallet creates ${agentAccount} with ${near(AGENT_ACCOUNT_DEPOSIT_YOCTO)} NEAR for its storage.`
        : `Your wallet installs the wallet contract on ${owner}. Your own keys stay on it.`;
  const step2Label =
    busy === 'wallet'
      ? 'Waiting for your wallet…'
      : busy === 'install'
        ? 'Creating the wallet…'
        : busy === 'hand'
          ? 'Handing the key to your agent…'
          : where === 'deterministic'
            ? `Send ${near(PAGE_KEY_FUNDING_YOCTO)} NEAR and create the wallet`
            : where === 'sub-account'
              ? `Create ${agentAccount}`
              : `Install on ${owner}`;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(agentAccount);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Set up your agent's wallet"
        description="Your agent keeps its funds in a wallet of its own on NEAR. Nothing leaves it without two signatures: your agent's, and OutLayer's enclave, which signs only what your rules allow."
      />

      {token === '' && (
        <p className="text-sm text-muted-foreground">
          This page opens from the link your agent gives you. Ask the agent for the link.
        </p>
      )}

      {(error || tokenError) && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive-text">{error || tokenError}</p>
        </div>
      )}

      {token && !tokenError && !setup && !error && <p className="text-sm text-muted-foreground">Reading the link…</p>}

      {setup && !isConnected && !done && (
        <section className={card}>
          <h2 className="text-sm font-semibold text-foreground">Connect {setup.owner}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your agent asked you, {setup.owner}, to set up its wallet.</p>
          <button type="button" onClick={connect} className={`mt-4 ${primary}`}>
            Connect your wallet
          </button>
        </section>
      )}

      {wrongAccount && !done && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive-text">
            You are connected as <span className="font-mono">{accountId}</span>; this agent&apos;s owner is{' '}
            <span className="font-mono">{owner}</span>. Switch wallets.
          </p>
        </div>
      )}

      {setup && isConnected && !wrongAccount && !done && (
        <div className="grid gap-4">
          <section className={card}>
            <div className="flex gap-3">
              <StepNumber n={1} done={!!pair} />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">Sign to make your agent&apos;s key</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A signature, not a transaction: it costs nothing. This page turns it into your agent&apos;s key, and you can
                  make the same key again any time by signing again.
                </p>
                {!pair && (
                  <>
                    <button type="button" onClick={deriveKey} disabled={!!busy || !nameOk} className={`mt-4 ${primary}`}>
                      {busy === 'key' ? 'Waiting for your wallet…' : 'Sign'}
                    </button>
                    <details className={more}>
                      <summary>Other options: the account the wallet is on</summary>
                      <div className="mt-3 grid gap-3">
                        <label className="flex items-start gap-2">
                          <input type="radio" checked={where === 'deterministic'} onChange={() => setWhere('deterministic')} />
                          <span>
                            <span className="text-foreground">A new account with no key</span> (recommended). Its address,{' '}
                            <span className="font-mono">0s…</span>, is made from your agent&apos;s keys.
                          </span>
                        </label>
                        <label className="flex items-start gap-2">
                          <input type="radio" checked={where === 'sub-account'} onChange={() => setWhere('sub-account')} />
                          <span>
                            <span className="text-foreground">A named sub-account:</span>{' '}
                            <input
                              value={name}
                              onChange={(e) => setName(e.target.value.trim().toLowerCase())}
                              className="w-28 rounded border border-border bg-background px-2 py-0.5 font-mono text-foreground"
                            />
                            <span className="font-mono">.{owner}</span>, for {near(AGENT_ACCOUNT_DEPOSIT_YOCTO)} NEAR of storage.
                            Some wallets do not allow it yet.
                            {!nameOk && (
                              <span className="block text-destructive-text">
                                Lowercase letters and digits, with single - or _ between them.
                              </span>
                            )}
                          </span>
                        </label>
                        <label className="flex items-start gap-2">
                          <input type="radio" checked={where === 'own-account'} onChange={() => setWhere('own-account')} />
                          <span>
                            <span className="text-foreground">Your own account,</span> <span className="font-mono">{owner}</span>.
                            The wallet contract replaces any contract on it; your keys stay.
                          </span>
                        </label>
                      </div>
                    </details>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className={`${card} ${pair ? '' : 'opacity-60'}`}>
            <div className="flex gap-3">
              <StepNumber n={2} done={done} />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">Create your agent&apos;s wallet</h2>
                <p className="mt-1 text-sm text-muted-foreground">{pair ? costOfStep2 : 'After step 1.'}</p>
                {pair && (
                  <button type="button" onClick={createWallet} disabled={!!busy} className={`mt-4 ${primary}`}>
                    {step2Label}
                  </button>
                )}
              </div>
            </div>
          </section>

          <details className={more}>
            <summary>Details</summary>
            <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-y-1 text-xs">
              <dt>Owner</dt>
              <dd className="font-mono">{setup.owner}</dd>
              <dt>Agent&apos;s OutLayer wallet</dt>
              <dd className="break-all font-mono">{setup.wallet_id}</dd>
              <dt>Enclave&apos;s key for it</dt>
              <dd className="break-all font-mono">{setup.tee_public_key}</dd>
              <dt>Network</dt>
              <dd>{network}</dd>
              <dt>Wallet contract</dt>
              <dd className="break-all font-mono">{WALLET_CONTRACT_CODE_HASH}</dd>
              {pair && (
                <>
                  <dt>Its pair of keys</dt>
                  <dd className="break-all font-mono">{pair}</dd>
                  <dt>Its account</dt>
                  <dd className="break-all font-mono">{agentAccount}</dd>
                </>
              )}
            </dl>
            {where === 'deterministic' && (
              <p className="mt-3 text-xs">
                Step 2 sends the NEAR to a one-time key this page made in this tab and stores nowhere. With it the page
                creates the wallet contract at its address (the address is the hash of the published contract and the pair
                above, so the account holds no key and runs nothing else), deletes the key&apos;s own account, and the rest of
                the NEAR returns to you.
              </p>
            )}
          </details>
        </div>
      )}

      {done && (
        <section className={card}>
          <h2 className="text-sm font-semibold text-foreground">Your agent&apos;s wallet is ready</h2>
          <p className="mt-2 break-all font-mono text-sm text-foreground">{agentAccount}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your agent already has its key and uses this wallet. Next, set what it may do: until then it can do nothing.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/wallet/manage" className={primary}>
              Set what the agent may do
            </Link>
            <button type="button" onClick={copyAddress} className={secondary}>
              {copied ? 'Address copied' : 'Copy the address, to send funds'}
            </button>
          </div>
          <details className={more}>
            <summary>How this works</summary>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-xs">
              {where === 'deterministic' && (
                <li>
                  The wallet&apos;s address is an address, not a name. This page and the recovery tool both derive it again
                  from your keys.
                </li>
              )}
              <li>Funds sent to the wallet move only under both signatures, and the enclave signs only what your rules allow.</li>
              <li>
                Your agent&apos;s OutLayer wallet pays the fee of each move: keep 0.5 NEAR on it. A move is checked against
                0.3 NEAR of gas and spends about 0.0004 NEAR.
              </li>
              <li>
                To make the agent&apos;s key again, sign the same message on this page with a new link from the agent. To take
                everything out without OutLayer, use the owner&apos;s exit.
              </li>
            </ul>
          </details>
        </section>
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
