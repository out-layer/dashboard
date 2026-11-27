'use client';

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  accountExists,
  closePageKey,
  otherKeyRefusal,
  setupCanName,
  toHex,
  type CurrentContract,
  isFullAccessKey,
  createDeterministicAccount,
  hasAccessKey,
  PageKeyClosed,
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
  /** The wallet contract the wallet has already: a setup of it hands its agent key over again. */
  current_contract: CurrentContract | null;
}

type Where = 'deterministic' | 'sub-account' | 'own-account';

const near = (yocto: bigint) => (Number(yocto / BigInt(1e21)) / 1000).toString();

const card = 'rounded-lg border border-border bg-card p-4 sm:p-5';
const primary =
  'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50';
const secondary =
  'rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-card-muted disabled:opacity-50';
const more = 'mt-4 text-sm text-muted-foreground [&>summary]:cursor-pointer [&>summary]:select-none';

// The setup token, read from the link's fragment: the page takes it out of the
// address bar right after and keeps this value. A new link opened in the same
// tab (only its fragment changes) replaces it, and the steps start again.
let tokenOfThisLoad: string | null = null;
const tokenInHash = () => new URLSearchParams(window.location.hash.slice(1)).get('setup');
const readToken = () => (tokenOfThisLoad ??= tokenInHash() ?? '');
const subscribeToken = (changed: () => void) => {
  const onHash = () => {
    const next = tokenInHash();
    if (next && next !== tokenOfThisLoad) {
      tokenOfThisLoad = next;
      changed();
    }
  };
  window.addEventListener('hashchange', onHash);
  return () => window.removeEventListener('hashchange', onHash);
};

function StepNumber({ n, done }: { n: number; done: boolean }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong text-xs tabular-nums text-muted-foreground">
      {done ? '✓' : n}
    </span>
  );
}

function Inner({ token }: { token: string | null }) {
  const { accountId, isConnected, connect, signAndSendTransaction, signMessage, network, rpcUrl } = useNearWallet();
  const coordinator = getCoordinatorApiUrl();

  // The token names the setup and lets its holder finish it, from the link's
  // fragment (`#setup=`): a fragment is sent to no server, so the token reaches
  // no log, proxy or link preview.
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
  // A wallet that has a wallet contract: the account step 2 hands the key over
  // for, found on chain; a signature that makes another agent key, held back
  // until the owner signs again or chooses a new contract; that choice.
  const [target, setTarget] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<{ why: string; seed: Uint8Array; pair: string; ownerKey: string } | null>(null);
  const [replacing, setReplacing] = useState(false);
  // The account the setup was finished with, as the coordinator answered.
  const [finished, setFinished] = useState<string | null>(null);
  const done = finished !== null;
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
  // A wallet that has a wallet contract keeps it, unless the owner chose a new
  // one: the account is the one found on chain for this signature, or on record.
  const current = replacing ? null : (setup?.current_contract ?? null);
  const fixed = replacing ? null : (target ?? current?.account_id ?? null);
  const accountFor = (choice: Where, forPair: string | null) =>
    fixed
      ? fixed
      : choice === 'own-account'
        ? owner
        : choice === 'sub-account'
          ? `${name}.${owner}`
          : forPair
            ? deterministicAccount(forPair)
            : '';
  const agentAccount = accountFor(where, pair);
  const nameOk = where !== 'sub-account' || isSubAccountName(name);

  // Another account after step 1: what was found for the earlier one no longer holds.
  const choose = (choice: Where) => {
    setWhere(choice);
    setCreated(false);
    setInstalled(false);
  };

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
  // Set once this page has sent its hand-over: only then is a 409 naming the
  // account its own finish, whose answer was lost, and not someone else's.
  const posted = useRef(false);
  // The setup as the last read answered it: what a step judges by, so that an
  // account the agent named while the page was open is seen.
  const fresh = useRef<Setup | null>(null);

  // Returns 'finished-here' when the setup is finished with the account this
  // page posted: its own hand-over, whose answer was lost.
  const requireOpen = async (madeHere?: string): Promise<'open' | 'finished-here'> => {
    const r = await fetch(`${coordinator}/wallet/v1/contract/setup/owner`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const read = (await r.json().catch(() => null)) as Setup | null;
      if (read) {
        fresh.current = read;
        setSetup(read);
      }
      return 'open';
    }
    const body = await r.json().catch(() => ({}));
    if (r.status === 409 && madeHere && posted.current && String(body?.message ?? '').includes(`\`${madeHere}\``)) {
      return 'finished-here';
    }
    throw new Error(
      r.status === 409
        ? 'Do not go on: this link was used already. Send nothing to the account it named, and ask the agent for a new link.'
        : body?.message || `The setup could not be read (HTTP ${r.status}).`,
    );
  };

  const deriveKey = () =>
    step('key', async () => {
      if (!setup) return;
      setMismatch(null);
      // The page signs the message it computes, never one it is handed.
      const message = agentKeyMessage(setup.owner, setup.wallet_id);
      const request = setup.agent_key_request;
      if (request.message !== message || request.recipient !== AGENT_KEY_RECIPIENT || request.nonce_base64 !== toBase64(AGENT_KEY_NONCE)) {
        throw new Error('The API asks for another message than this page signs. Nothing was signed.');
      }
      const signed = await signMessage({ message, recipient: AGENT_KEY_RECIPIENT, nonce: toBase64(AGENT_KEY_NONCE) });
      if (!signed) throw new Error('The wallet returned no signature.');
      if (signed.accountId !== setup.owner) throw new Error(`The message was signed by ${signed.accountId}, not by ${setup.owner}.`);
      // The agent's key follows from this signature, and so from the key that
      // made it: it has to be a key of the account that stays, not an app's
      // function-call key that is removed when the app signs out.
      if (!(await isFullAccessKey(rpcUrl, setup.owner, signed.publicKey))) {
        throw new Error(
          `The message was signed with ${signed.publicKey}, which is not a full-access key of ${setup.owner}. Sign with your account's own key: you need the same key to make the agent's key again.`,
        );
      }
      const agentSeed = await agentKeySeed(fromBase64(signed.signature), setup.owner, setup.wallet_id);
      const agentPublicKey = await publicKeyOfSeed(agentSeed);
      const derived = pairText(agentPublicKey, setup.tee_public_key);
      // Here, with no wallet to follow: step 2 opens the wallet first thing.
      await requireOpen();
      // Everything is read before anything is kept: a step that fails here
      // leaves step 1 to be signed again, and step 2 closed.
      const recorded = replacing ? null : (fresh.current?.current_contract ?? null);
      let handTo: string | null = null;
      let refusal: string | null = null;
      if (recorded && recorded.agent_public_key === toHex(agentPublicKey)) {
        if (!setupCanName(recorded.account_id, setup.owner)) {
          throw new Error(
            `${recorded.account_id} was named by your agent itself, not set up on this page, so this page cannot give its key again. Nothing was sent.`,
          );
        }
        if ((await viewPair(rpcUrl, recorded.account_id)) === derived) {
          handTo = recorded.account_id;
        } else {
          refusal = `${recorded.account_id} no longer answers with this wallet's pair of keys on chain: its contract was replaced or removed. Nothing was sent.`;
        }
      } else if (recorded) {
        // A contract this key made before is the owner's own: the key goes to it.
        for (const account of [deterministicAccount(derived), setup.owner]) {
          if ((await viewPair(rpcUrl, account)) === derived) {
            handTo = account;
            break;
          }
        }
        if (!handTo) refusal = otherKeyRefusal(recorded, toHex(agentPublicKey), setup.owner, signed.publicKey);
      } else if ((await viewPair(rpcUrl, accountFor(where, derived))) === derived) {
        // An account that already runs the wallet contract with this pair has
        // nothing left to install: the key is handed to the agent again.
        handTo = accountFor(where, derived);
      }
      if (refusal) {
        setMismatch({ why: refusal, seed: agentSeed, pair: derived, ownerKey: signed.publicKey });
        return;
      }
      setMismatch(null);
      setSeed(agentSeed);
      setPair(derived);
      setOwnerKey(signed.publicKey);
      if (handTo) {
        setTarget(handTo);
        setCreated(true);
        setInstalled(true);
      }
    });

  // Back from that choice before anything was sent: step 1 is signed again.
  const undoReplace = () => {
    setReplacing(false);
    setSeed(null);
    setPair(null);
    setOwnerKey(null);
    setTarget(null);
    setCreated(false);
    setInstalled(false);
  };

  // The owner's choice after a signature of another key: a new wallet contract
  // for this key. The contract on record and its funds stay where they are.
  const replaceContract = () => {
    if (!mismatch) return;
    setReplacing(true);
    setSeed(mismatch.seed);
    setPair(mismatch.pair);
    setOwnerKey(mismatch.ownerKey);
    setMismatch(null);
  };

  // With the page's one-time key, after the owner's transaction: the wallet
  // contract on a new account. Opens no wallet. On a 0s account the key's own
  // account is closed to the owner whatever happens, unless a retry may use it.
  const install = async (key: KeyPair, account: string, choice: Where) => {
    if (!pair) return;
    try {
      await requireOpen();
    } catch (e) {
      if (choice === 'deterministic') await closePageKey(rpcUrl, key, owner).catch(() => false);
      throw e;
    }
    if ((await viewPair(rpcUrl, account)) === pair) {
      if (choice === 'deterministic') await closePageKey(rpcUrl, key, owner).catch(() => false);
      setInstalled(true);
      return;
    }
    if (choice === 'deterministic') {
      await createDeterministicAccount(rpcUrl, key, owner, pair);
    } else {
      await sendAsAccount(rpcUrl, account, key, installAndDropKeyActions(pair, key.getPublicKey().toString(), ownerKey));
    }
    if ((await viewPair(rpcUrl, account)) !== pair) {
      throw new Error(`${account} does not answer with the pair of keys yet. Press the button again in a few seconds.`);
    }
    setInstalled(true);
  };

  // The agent's key, sealed to the one-time key the agent made, left with the
  // account's name. Opens no wallet.
  const handOver = async (account: string) => {
    if (!setup || !seed) return;
    if ((await requireOpen(account)) === 'finished-here') {
      setFinished(account);
      return;
    }
    const sealed = await sealAgentKey(setup.recipient_public_key, seed, setup.wallet_id);
    posted.current = true;
    const r = await fetch(`${coordinator}/wallet/v1/contract/setup/owner`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ account_id: account, sealed_agent_key: toBase64(sealed) }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok && r.status === 400 && account === setup.current_contract?.account_id) {
      throw new Error(`${account} was named by your agent itself, not set up on this page, so this page cannot give its key again. Nothing was sent.`);
    }
    if (!r.ok) throw new Error(body?.message || body?.error || `The setup was not finished (HTTP ${r.status}).`);
    setFinished(String(body.account_id ?? account));
  };

  // Whether the owner's transaction is on chain, read from the chain and not
  // from the wallet's answer: up to `tries` reads two seconds apart.
  const landed = async (key: KeyPair | null, account: string, choice: Where, tries: number): Promise<boolean> => {
    for (let i = 0; i < tries; i++) {
      const on = await (async () => {
        try {
          return !key
            ? (await viewPair(rpcUrl, account)) === pair
            : choice === 'sub-account'
              ? await hasAccessKey(rpcUrl, account, key.getPublicKey().toString())
              : await accountExists(rpcUrl, implicitAccountOf(key));
        } catch {
          return false;
        }
      })();
      if (on) return true;
      if (i + 1 < tries) await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  };

  // The one click of step 2: the owner's one wallet transaction first, then the
  // page's own work, all for the account and the choice of the moment of the
  // click. Pressed again after a failure, it goes on from what the chain
  // shows; the wallet is asked again only if its transaction is not there.
  const createWallet = () =>
    step('create', async () => {
      if (!pair) return;
      // A wallet that has a contract gets no second one but by the owner's choice.
      if (current && !(created && installed)) {
        throw new Error(`This wallet has its wallet contract, ${current.account_id}. Nothing was sent.`);
      }
      const choice = where;
      const account = agentAccount;
      const own = choice === 'own-account';
      const key = own ? null : (pageKey ?? KeyPair.fromRandom('ed25519'));
      if (key && key !== pageKey) setPageKey(key);
      let isCreated = created;
      if (!isCreated) {
        // own account: the install itself; a sub-account: created with the page's
        // key and the owner's; a 0s account: NEAR for the page's key
        const [receiverId, actions] = !key
          ? [account, installActions(pair)]
          : choice === 'sub-account'
            ? [account, createAccountActions(key.getPublicKey().toString(), ownerKey)]
            : [implicitAccountOf(key), fundPageKeyActions()];
        setBusy('wallet');
        let refused: unknown = null;
        try {
          await signAndSendTransaction({ receiverId, actions });
        } catch (e) {
          refused = e;
        }
        // a refused wallet: a short look; an answered one: time to be final
        if (!(await landed(key, account, choice, refused ? 2 : 6))) {
          if (choice === 'sub-account' && (await viewPair(rpcUrl, account)) === pair) {
            // this key's own contract, from an earlier setup: the key goes to it
            setCreated(true);
            setInstalled(true);
            setBusy('hand');
            await handOver(account);
            return;
          }
          if (choice === 'sub-account' && (await accountExists(rpcUrl, account))) {
            throw new Error(
              `${account} exists already, from an earlier attempt. Delete it in your wallet, or choose another name under Other options.`,
            );
          }
          throw refused ?? new Error("Your wallet's transaction is not on chain. Press the button again.");
        }
        isCreated = true;
        setCreated(true);
      }
      let isInstalled = installed || own;
      if (own) setInstalled(true);
      if (!isInstalled && key) {
        setBusy('install');
        try {
          await install(key, account, choice);
        } catch (e) {
          if (e instanceof PageKeyClosed) {
            // the NEAR is back with the owner: the next click funds a new key
            setCreated(false);
            setPageKey(null);
          }
          throw e;
        }
        isInstalled = true;
      }
      if (isCreated && isInstalled) {
        setBusy('hand');
        await handOver(account);
      }
    });

  const handOnly = created && installed;
  // The contract the wallet has now, when step 2 moves the agent off it.
  const recordedAccount = setup?.current_contract?.account_id ?? null;
  const movesOff = recordedAccount && (replacing || agentAccount !== recordedAccount) ? recordedAccount : null;
  const costOfStep2 =
    (handOnly
      ? `${agentAccount} is set up already. Nothing is sent: the page gives your agent its key again.`
      : where === 'deterministic'
        ? `Your wallet sends ${near(PAGE_KEY_FUNDING_YOCTO)} NEAR for the fees; most of it comes back to you.`
        : where === 'sub-account'
          ? `Your wallet creates ${agentAccount} with ${near(AGENT_ACCOUNT_DEPOSIT_YOCTO)} NEAR for its storage.`
          : `Your wallet installs the wallet contract on ${owner}. Your own keys stay on it.`) +
    (movesOff ? ` Your agent moves from ${movesOff} to ${agentAccount}; the funds in ${movesOff} stay there.` : '');
  const step2Label =
    busy === 'wallet'
      ? 'Waiting for your wallet…'
      : busy === 'install'
        ? 'Creating the wallet…'
        : busy === 'hand'
          ? 'Handing the key to your agent…'
          : handOnly
            ? movesOff
              ? `Move your agent to ${agentAccount}`
              : 'Give the key to your agent'
            : where === 'deterministic'
              ? `Send ${near(PAGE_KEY_FUNDING_YOCTO)} NEAR and create the wallet`
              : where === 'sub-account'
                ? `Create ${agentAccount}`
                : `Install on ${owner}`;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(finished ?? '');
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
                  <button type="button" onClick={deriveKey} disabled={!!busy || !nameOk} className={`mt-4 ${primary}`}>
                    {busy === 'key' ? 'Waiting for your wallet…' : 'Sign'}
                  </button>
                )}
                {mismatch && (
                  <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                    <p className="text-destructive-text">{mismatch.why}</p>
                    <p className="mt-2 text-muted-foreground">
                      Or set up a new wallet contract for this signature instead: for instance when you did not set up{' '}
                      {setup.current_contract?.account_id} yourself (someone else used a link), or can no longer sign with the
                      key that did. Funds in {setup.current_contract?.account_id} do not move to it.
                    </p>
                    <button type="button" onClick={replaceContract} disabled={!!busy} className={`mt-3 ${secondary}`}>
                      Set up a new wallet contract instead
                    </button>
                  </div>
                )}
                {replacing && !created && !pageKey && (
                  <button type="button" onClick={undoReplace} disabled={!!busy} className={`mt-4 ${secondary}`}>
                    Sign with another key instead
                  </button>
                )}
                {!created && !pageKey && !current && (
                  <>
                    <details className={more}>
                      <summary>Other options: the account the wallet is on</summary>
                      <fieldset disabled={!!busy} className="mt-3 grid gap-3">
                        <label className="flex items-start gap-2">
                          <input type="radio" checked={where === 'deterministic'} onChange={() => choose('deterministic')} />
                          <span>
                            <span className="text-foreground">A new account with no key</span> (recommended). Its address,{' '}
                            <span className="font-mono">0s…</span>, is made from your agent&apos;s keys.
                          </span>
                        </label>
                        <label className="flex items-start gap-2">
                          <input type="radio" checked={where === 'sub-account'} onChange={() => choose('sub-account')} />
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
                          <input type="radio" checked={where === 'own-account'} onChange={() => choose('own-account')} />
                          <span>
                            <span className="text-foreground">Your own account,</span> <span className="font-mono">{owner}</span>.
                            The wallet contract replaces any contract on it; your keys stay.
                          </span>
                        </label>
                      </fieldset>
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
          <p className="mt-2 break-all font-mono text-sm text-foreground">{finished}</p>
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
              {finished?.startsWith('0s') && (
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

function Gate() {
  const token = useSyncExternalStore(subscribeToken, readToken, () => null);
  return <Inner key={token ?? ''} token={token} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-8">Loading…</div>}>
      <Gate />
    </Suspense>
  );
}
