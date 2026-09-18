'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { actionCreators } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { PolicyEditor } from '@/components/policy/PolicyEditor';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { bytesToHex, eciesEncrypt, generateReplyKeypair, hexToBytes, openReply } from '@/lib/ecies';
import { waitForTransactionOutcome } from '@/lib/near-rpc';
import { gmailPolicy } from '@/lib/policies/gmail';
import { emptyValue, fromJson, toJson, validate } from '@/lib/policies/policy';
import type { PolicyValue } from '@/lib/policies/types';
import { formatAccessCondition } from '@/app/secrets/components/utils';

/**
 * Connecting a Gmail account, and looking after the connection afterwards.
 *
 * Two facts shape this page. A wallet cannot be opened from inside a promise
 * chain — only from a click — so every signature waits behind a button, which
 * is also where the reader learns what they are about to sign. And the policy
 * is sealed on chain together with the credential, so this page cannot read it
 * back: the one way to see it is to run the connector, which on chain is a
 * transaction whose answer comes back sealed to a key this page holds.
 *
 * What is stored is the refresh token and the policy. The OAuth client the
 * token belongs to is the connector's own, held as its author secret, so
 * nobody's row carries a credential of ours for them to extract.
 */

/** The curated Gmail connector, per network. */
const GMAIL_PROJECT: Record<string, string> = {
  testnet: 'connectors.outlayer.testnet/gmail',
  mainnet: 'connectors.outlayer.near/gmail',
};

/** The one scope this connector implements, and the only one asked for. */
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

/** The profile an agent names in `secrets_ref` to reach this row. */
const PROFILE = 'gmail';

const STATE_KEY = 'outlayer:connect:gmail:state';
/** Why the consent was started: a first connection, or a new token for a row that exists. */
const MODE_KEY = 'outlayer:connect:gmail:mode';

/** The reply key of a policy read in flight, for a wallet that leaves the page
 *  to sign and comes back by redirect: the answer is sealed to this key, and a
 *  page that has been reloaded holds nothing else. Per tab, gone with it, and
 *  removed the moment the answer is opened or the read is abandoned. */
const REPLY_KEY = 'outlayer:connect:gmail:reply';
const REPLY_TTL_MS = 10 * 60 * 1000;

/** What the keystore's NEP-413 check expects as the recipient — the same string the secrets page signs for. */
const KEYSTORE_RECIPIENT = 'keystore.outlayer.near';

/** The connector's own words in a `status` answer, beside the policy's fields. */
const STATUS_META_KEYS = new Set(['present', 'effect', 'readable', 'error']);

type Stage = 'idle' | 'preparing' | 'ready' | 'storing' | 'done';
type Update = { keys: Record<string, string>; label: string };
type UpdateStage = 'idle' | 'signing' | 'ready-to-store' | 'storing';

interface Row {
  access: unknown;
  created_at: number;
  updated_at: number;
}

function ConnectGmail() {
  const { accountId, signAndSendTransaction, signMessage, contractId, viewMethod, network } = useNearWallet();
  const params = useSearchParams();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [error, setError] = useState<string | null>(null);

  // ---- the row this account holds, if any ------------------------------
  /** `'unknown'`: the contract could not be read — neither "connected" nor "not yet" may be shown. */
  const [row, setRow] = useState<Row | null | 'loading' | 'unknown'>('loading');
  const [vaultId, setVaultId] = useState<string | null>(null);

  // ---- a first connection ---------------------------------------------
  const [stage, setStage] = useState<Stage>('idle');
  /** Google's durable credential, held until the owner signs — the policy chosen at the pause is sealed with it. */
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  /** The row's public key, derived inside the keystore enclave from the accessor and the owner. */
  const [rowPubkey, setRowPubkey] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const attempted = useRef(false);

  // ---- the policy, as this page knows it ------------------------------
  const [policy, setPolicy] = useState<PolicyValue>(emptyValue());
  /** Whether `policy` is what the connector reported, or only what this page has typed. */
  const [policyRead, setPolicyRead] = useState<{ present: boolean; sentToday: number; unknownKeys: string[] } | null>(null);
  const [reading, setReading] = useState(false);

  // ---- an update of an existing row: sign, then store -----------------
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateStage, setUpdateStage] = useState<UpdateStage>('idle');
  const [pendingCiphertext, setPendingCiphertext] = useState<string | null>(null);
  /** What the keystore says it re-sealed, shown before the owner stores it. */
  const [pendingSummary, setPendingSummary] = useState<{ total: number; updated: string[] } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** A new token for an existing row, waiting for the owner's signature. */
  const [reconnectToken, setReconnectToken] = useState<string | null>(null);

  const projectId = GMAIL_PROJECT[network] ?? GMAIL_PROJECT.testnet;
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
  // Google matches this against the registered list byte for byte, and the same
  // string has to be sent again at the exchange.
  const redirectUri = useMemo(
    () => (typeof window === 'undefined' ? '' : `${window.location.origin}/connect/gmail`),
    [],
  );

  // The accessor has TWO shapes and they are not interchangeable: the
  // coordinator's enum is internally tagged (`#[serde(tag = "type")]`), the
  // contract's is externally tagged. Sending one where the other is expected is
  // a 422 with nothing in it to explain itself.
  const forCoordinator = useMemo(() => ({ type: 'Project', project_id: projectId }), [projectId]);
  const forContract = useMemo(() => ({ Project: { project_id: projectId } }), [projectId]);

  const policyErrors = validate(gmailPolicy, policy);
  /** The row's fields, or null while loading, unknown, or absent. */
  const loaded: Row | null = typeof row === 'object' ? row : null;

  // ---- read the row -----------------------------------------------------
  const loadRow = useCallback(async () => {
    if (!accountId) return;
    try {
      const [found, vault] = await Promise.all([
        viewMethod({ contractId, method: 'get_secrets', args: { accessor: forContract, profile: PROFILE, owner: accountId } }),
        viewMethod({ contractId, method: 'get_secret_vault', args: { accessor: forContract, profile: PROFILE, owner: accountId } }),
      ]);
      setRow(found && typeof found === 'object' ? (found as Row) : null);
      setVaultId(typeof vault === 'string' ? vault : null);
    } catch (e) {
      // Not `null`: that would offer a first connection to an account that may
      // well be connected, and the refusal would come only after Google.
      setRow('unknown');
      setError(`Could not read the contract: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [accountId, contractId, forContract, viewMethod]);

  useEffect(() => {
    void loadRow();
  }, [loadRow]);

  // ---- Google consent ---------------------------------------------------
  const consent = useCallback(
    (mode: 'connect' | 'reconnect') => {
      const state = crypto.randomUUID();
      sessionStorage.setItem(STATE_KEY, state);
      sessionStorage.setItem(MODE_KEY, mode);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', SCOPE);
      // Both are required for a refresh token: offline asks for one, and consent
      // forces the screen for an account that has granted this app before —
      // without which Google sends back an access token that dies in an hour.
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('state', state);
      window.location.href = url.toString();
    },
    [clientId, redirectUri],
  );

  const exchange = useCallback(
    async (code: string): Promise<string> => {
      const exchanged = await fetch('/connect/gmail/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      });
      const answer = await exchanged.json().catch(() => ({}));
      if (!exchanged.ok) throw new Error(answer?.error || `The exchange failed (HTTP ${exchanged.status}).`);
      return answer.refresh_token as string;
    },
    [redirectUri],
  );

  /** A first connection, step one: the row's key is fetched for a credential
   *  in hand. No wallet, no signature, nothing on chain yet. The policy is
   *  chosen at the pause that follows and sealed with the token on the click. */
  const prepareWithToken = useCallback(
    async (token: string) => {
      setError(null);
      setStage('preparing');
      try {
        // The names are what the keystore checks here — a reserved one would be
        // refused — and they do not change with the policy's content.
        const pubkeyResponse = await fetch(`${coordinatorUrl}/secrets/pubkey`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessor: forCoordinator,
            owner: accountId,
            secrets_json: JSON.stringify({ GMAIL_REFRESH_TOKEN: token, GMAIL_POLICY: '{}' }),
          }),
        });
        if (!pubkeyResponse.ok) throw new Error(await pubkeyResponse.text());
        const { pubkey } = await pubkeyResponse.json();
        setRefreshToken(token);
        setRowPubkey(pubkey);
        setStage('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage('idle');
      }
    },
    [accountId, coordinatorUrl, forCoordinator],
  );

  const prepare = useCallback(
    async (code: string) => {
      setError(null);
      setStage('preparing');
      try {
        await prepareWithToken(await exchange(code));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage('idle');
      }
    },
    [exchange, prepareWithToken],
  );

  // A reconnect whose row is gone by the time Google answers has a credential
  // and nowhere to merge it. It becomes a first connection, not a blank page.
  useEffect(() => {
    if (row === null && reconnectToken && stage === 'idle') {
      const token = reconnectToken;
      setReconnectToken(null);
      void prepareWithToken(token);
    }
  }, [row, reconnectToken, stage, prepareWithToken]);

  /** A first connection, step two, from a click: seal token and policy, then one transaction. */
  const finish = useCallback(async () => {
    if (!refreshToken || !rowPubkey) return;
    setError(null);
    setStage('storing');
    try {
      // Values are strings: a secret row is `HashMap<String, String>`, so the
      // policy travels as JSON text. `{}` is the widest it goes.
      const secretsJson = JSON.stringify({
        GMAIL_REFRESH_TOKEN: refreshToken,
        GMAIL_POLICY: toJson(gmailPolicy, policy),
      });
      const sealed = Buffer.from(eciesEncrypt(rowPubkey, new TextEncoder().encode(secretsJson))).toString('base64');
      // Yours alone until you grant an agent. A connector row left open would
      // let anyone who names it send mail as you.
      const args = {
        accessor: forContract,
        profile: PROFILE,
        encrypted_secrets_base64: sealed,
        access: { Whitelist: { accounts: [accountId] } },
        vault_id: null,
      };
      // A row that exists keeps its rule and its policy: this path would reset
      // both. A tab that started a first connection before another one finished
      // is how a first connection reaches an existing row.
      const existing = await viewMethod({ contractId, method: 'get_secrets', args: { accessor: forContract, profile: PROFILE, owner: accountId } });
      if (existing) {
        throw new Error('This account already has a Gmail row. Reload the page and use "Reconnect Google account" to put the new credential in it.');
      }
      const cost = await viewMethod({ contractId, method: 'estimate_storage_cost', args: { ...args, owner: accountId } });
      if (!cost) throw new Error('The contract would not quote the storage cost.');
      const response = await signAndSendTransaction({
        receiverId: contractId,
        actions: [actionCreators.functionCall('store_secrets', args, BigInt('50000000000000'), BigInt(String(cost)))],
      });
      setTxHash(response?.transaction?.hash ?? null);
      setRefreshToken(null);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Back to `ready`, not to the start: the credential is still in hand, so
      // a refused or closed wallet costs another click and not another trip
      // through Google.
      setStage('ready');
    }
  }, [accountId, contractId, forContract, policy, refreshToken, rowPubkey, signAndSendTransaction, viewMethod]);

  // ---- an existing row: read the policy by running the connector ----------
  /** The connector's answer, opened with the reply key and put into the editor. */
  const openAnswer = useCallback(
    (outcome: { status?: { SuccessValue?: string } } | null | undefined, secretKey: Uint8Array) => {
      const returned = outcome?.status?.SuccessValue;
      if (typeof returned !== 'string') throw new Error('The transaction finished without an answer from the connector.');
      let envelope: unknown = JSON.parse(Buffer.from(returned, 'base64').toString());
      if (typeof envelope === 'string') envelope = JSON.parse(envelope);
      const env = envelope as { success?: boolean; error?: string; output?: Record<string, unknown> };
      if (!env.success) throw new Error(env.error || 'The connector refused the run.');
      const sealed = env.output?.policy_sealed;
      if (typeof sealed !== 'string') throw new Error('The connector answered without a sealed policy.');
      const opened = JSON.parse(new TextDecoder().decode(openReply(secretKey, Buffer.from(sealed, 'base64')))) as Record<
        string,
        unknown
      >;
      if (opened.readable === false) {
        throw new Error(`The stored policy cannot be read by the connector: ${String(opened.error)}. Save a new one below.`);
      }
      const fieldsOnly = Object.fromEntries(Object.entries(opened).filter(([k]) => !STATUS_META_KEYS.has(k)));
      const { value, unknownKeys } = fromJson(gmailPolicy, fieldsOnly);
      setPolicy(opened.present === false ? emptyValue() : value);
      setPolicyRead({ present: opened.present !== false, sentToday: Number(env.output?.sent_today ?? 0), unknownKeys });
      setSaved(null);
    },
    [],
  );

  /** From a click: one transaction runs `status` with a key made here; the
   *  answer's policy comes back sealed to it and is opened in this page.
   *
   *  TODO(global payment key): when the dashboard holds a payment key for the
   *  signed-in account, read over HTTPS instead — `POST /call/{project}` with
   *  `X-Payment-Key`, the same `reply_pubkey` in the input and `secrets_ref`
   *  naming this account's row — and keep this transaction as the fallback.
   *  That drops the 0.1 NEAR round trip and the redirect-wallet detour
   *  below; near.email's `web-ui/src/lib/near.ts` does it both ways. */
  const readPolicy = useCallback(async () => {
    if (!accountId) return;
    setError(null);
    setReading(true);
    try {
      const reply = generateReplyKeypair();
      // A wallet that signs on its own page comes back by redirect, to a page
      // that remembers nothing. The key the answer is sealed to has to survive
      // that trip, or the answer can never be opened. Popup wallets return
      // here directly and the entry is removed a few lines down.
      sessionStorage.setItem(REPLY_KEY, JSON.stringify({ sec: bytesToHex(reply.secretKey), at: Date.now() }));
      const args = {
        source: { Project: { project_id: projectId, version_key: null } },
        resource_limits: { max_instructions: 10000000000, max_memory_mb: 128, max_execution_seconds: 60 },
        input_data: JSON.stringify({ operation: 'status', reply_pubkey: reply.publicKeyHex }),
        response_format: 'Json',
        // The row named is this account's own; the signer is judged against its rule.
        secrets_ref: { account_id: accountId, profile: PROFILE },
      };
      const result = await signAndSendTransaction({
        receiverId: contractId,
        actions: [actionCreators.functionCall('request_execution', args, BigInt('300000000000000'), BigInt('100000000000000000000000'))],
      });
      sessionStorage.removeItem(REPLY_KEY);
      openAnswer(result, reply.secretKey);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // The RPC stops waiting before a slow run resumes; the transaction still
      // completes, and the policy in it was sealed to a key this page has just
      // dropped. Nothing to salvage — say what happened and what to do.
      setError(
        /timeout|timed out/i.test(message)
          ? 'The wallet stopped waiting before the connector answered; the run still completes on its own. Try again — it is the same 0.1 NEAR round trip.'
          : message,
      );
      sessionStorage.removeItem(REPLY_KEY);
    } finally {
      setReading(false);
    }
  }, [accountId, contractId, openAnswer, projectId, signAndSendTransaction]);

  // Back from a wallet that signs on its own page: the transaction's hash is in
  // the address bar and the page has been reloaded. A policy read is finished
  // here with the key kept for it; any other transaction only needs the row
  // read again.
  const { rpcUrl } = useNearWallet();
  useEffect(() => {
    if (!accountId) return;
    const url = new URLSearchParams(window.location.search);
    const hashes = url.get('transactionHashes');
    const errorCode = url.get('errorCode');
    if (!hashes && !errorCode) return;
    window.history.replaceState({}, '', '/connect/gmail');
    let pending: { sec: string; at: number } | null = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(REPLY_KEY) ?? 'null');
    } catch {
      pending = null;
    }
    sessionStorage.removeItem(REPLY_KEY);
    if (errorCode) {
      setError(errorCode === 'userRejected' ? 'The wallet refused the transaction, so nothing changed.' : `The wallet reported: ${errorCode}.`);
      return;
    }
    const hash = (hashes ?? '').split(',').filter(Boolean).pop();
    if (!hash) return;
    if (!pending || Date.now() - pending.at > REPLY_TTL_MS) {
      // A store or an update went through the wallet's page: the row is what
      // changed, so read it again.
      setSaved(`Transaction ${hash} completed.`);
      void loadRow();
      return;
    }
    setReading(true);
    waitForTransactionOutcome(hash, accountId, rpcUrl)
      .then((outcome) => {
        if (!outcome) throw new Error('The transaction could not be found yet. Reload in a moment.');
        openAnswer(outcome as { status?: { SuccessValue?: string } }, hexToBytes(pending!.sec));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setReading(false));
  }, [accountId, loadRow, openAnswer, rpcUrl]);

  // ---- an existing row: merge new keys into it -----------------------------
  /** Step one, from a click: the owner signs, the keystore re-seals the row
   *  with these keys merged in. Nothing on chain yet. */
  const beginUpdate = useCallback(
    async (next: Update) => {
      if (!accountId) return;
      setError(null);
      setUpdate(next);
      setUpdateStage('signing');
      try {
        const nonceBytes = new Uint8Array(32);
        crypto.getRandomValues(nonceBytes);
        const nonce = btoa(String.fromCharCode(...nonceBytes));
        const keys = Object.keys(next.keys).sort();
        // The keystore rebuilds this message from the request and checks the
        // signature against it: the key names are part of what was signed.
        const message = `Update Outlayer secrets for ${accountId}:${PROFILE}\nkeys:${keys.join(',')}`;
        const signed = await signMessage({ message, recipient: KEYSTORE_RECIPIENT, nonce });
        if (!signed) throw new Error('The signature was not given, so nothing changed.');
        const response = await fetch(`${coordinatorUrl}/secrets/update_user_secrets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessor: forCoordinator,
            profile: PROFILE,
            owner: accountId,
            mode: 'append',
            secrets: next.keys,
            signed_message: message,
            signature: signed.signature,
            public_key: signed.publicKey,
            nonce,
            recipient: KEYSTORE_RECIPIENT,
          }),
        });
        if (!response.ok) {
          let why = await response.text();
          try {
            const parsed = JSON.parse(why);
            why = parsed.error || parsed.message || why;
          } catch {
            /* plain text */
          }
          if (/public key/i.test(why)) why += ` — this wallet signed with "${signed.publicKey}".`;
          throw new Error(why);
        }
        const answer = await response.json();
        const total = Number(answer?.summary?.total_keys ?? 0);
        const updated: string[] = Array.isArray(answer?.summary?.updated_keys) ? answer.summary.updated_keys : [];
        // The keystore merges into what it read from the contract, and when it
        // reads nothing it starts from nothing — a row it could not see comes
        // back holding only the keys sent now. Stored, that would drop the
        // refresh token. A policy update on a connected row has two keys or it
        // is not stored.
        if (next.keys.GMAIL_POLICY !== undefined && total < 2) {
          throw new Error(
            `The keystore re-sealed a row with ${total} key${total === 1 ? '' : 's'}, so the refresh token would not survive — nothing was stored. Try again in a moment; if it repeats, the keystore cannot see this row yet.`,
          );
        }
        setPendingCiphertext(answer.encrypted_secrets_base64);
        setPendingSummary({ total, updated });
        setUpdateStage('ready-to-store');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setUpdateStage('idle');
        setUpdate(null);
      }
    },
    [accountId, coordinatorUrl, forCoordinator, signMessage],
  );

  /** Step two, from a click: the re-sealed row goes on chain, under the rule it already has. */
  const storeUpdate = useCallback(async () => {
    if (!pendingCiphertext || !update || !loaded) return;
    setError(null);
    setUpdateStage('storing');
    try {
      const args = {
        accessor: forContract,
        profile: PROFILE,
        encrypted_secrets_base64: pendingCiphertext,
        access: loaded.access,
        vault_id: vaultId,
      };
      const cost = await viewMethod({ contractId, method: 'estimate_storage_cost', args: { ...args, owner: accountId } });
      if (!cost) throw new Error('The contract would not quote the storage cost.');
      await signAndSendTransaction({
        receiverId: contractId,
        actions: [actionCreators.functionCall('store_secrets', args, BigInt('50000000000000'), BigInt(String(cost)))],
      });
      setSaved(update.label);
      setPendingCiphertext(null);
      setPendingSummary(null);
      setUpdate(null);
      setUpdateStage('idle');
      setReconnectToken(null);
      if ('GMAIL_POLICY' in update.keys) setPolicyRead({ present: true, sentToday: policyRead?.sentToday ?? 0, unknownKeys: [] });
      void loadRow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // The re-sealed row is still in hand: one more click, not another signature.
      setUpdateStage('ready-to-store');
    }
  }, [accountId, contractId, forContract, loadRow, loaded, pendingCiphertext, policyRead, signAndSendTransaction, update, vaultId, viewMethod]);

  // ---- back from Google ---------------------------------------------------
  // The state it carries has to be the one this tab generated: without that
  // check, a link could make a signed-in user store an account they never
  // consented to.
  useEffect(() => {
    const refused = params.get('error');
    if (refused) {
      setError(refused === 'access_denied' ? 'The consent screen was dismissed, so nothing was connected.' : `Google refused the consent: ${refused}`);
      return;
    }
    const code = params.get('code');
    if (!code || !accountId || attempted.current) return;
    // Once, and only once. Without this latch a failure inside `prepare` puts
    // the stage back to idle, the effect runs again with the code still in the
    // URL, and the state check — whose value the first pass consumed — reports
    // "not from this tab" over the top of the real reason.
    attempted.current = true;
    const expected = sessionStorage.getItem(STATE_KEY);
    const mode = sessionStorage.getItem(MODE_KEY) ?? 'connect';
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(MODE_KEY);
    // The code is spent either way. Taking it out of the address bar keeps a
    // reload from retrying something Google will never honour twice.
    window.history.replaceState({}, '', '/connect/gmail');
    if (!expected || params.get('state') !== expected) {
      setError('This callback did not come from a connection started in this tab. Start again.');
      return;
    }
    if (mode === 'reconnect') {
      // A new token for a row that exists: it joins the row through the same
      // signed update a policy does, so the policy already stored stays.
      setError(null);
      exchange(code)
        .then((token) => setReconnectToken(token))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }
    void prepare(code);
  }, [params, accountId, exchange, prepare]);

  // ---- render -------------------------------------------------------------
  const busy = updateStage === 'signing' || updateStage === 'storing' || reading;
  const connectedSince = loaded ? new Date(loaded.created_at / 1_000_000) : null;
  const updatedAt = loaded ? new Date(loaded.updated_at / 1_000_000) : null;

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Connect Gmail" description="Let an agent send mail from your own address." />

      {!clientId && (
        <p className="text-sm text-red-600">
          This deployment has no Google client configured, so the consent screen cannot be opened.
        </p>
      )}

      {row === 'loading' && stage === 'idle' && <p className="text-sm text-muted-foreground">Checking whether this account is connected…</p>}

      {row === 'unknown' && stage === 'idle' && (
        <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
          <p>Whether this account is connected could not be read from the contract just now.</p>
          <button onClick={() => { setError(null); setRow('loading'); void loadRow(); }} className="rounded border border-gray-300 px-4 py-2 text-sm">
            Try again
          </button>
        </div>
      )}

      {/* ---------------- a first connection ---------------- */}
      {row === null && stage === 'idle' && !reconnectToken && (
        <>
          <p className="text-sm">
            Google will ask you to allow one thing: sending mail. This connector cannot read your
            mailbox — it never asks for a scope that would let it, so no message of yours can reach
            an agent.
          </p>
          <button
            onClick={() => consent('connect')}
            disabled={!clientId}
            className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Connect Google account
          </button>
        </>
      )}

      {stage === 'preparing' && <p className="text-sm">Getting a durable credential from Google…</p>}

      {(stage === 'ready' || stage === 'storing') && (
        <>
          <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
            <p className="font-medium">Google has granted the credential.</p>
            <p>
              Nothing has been stored yet. When you press the button, this browser seals the
              credential and the policy below to a key whose private half exists only inside the
              keystore enclave — <strong>not on our servers, and not in this page</strong> — and one
              transaction writes them to the smart contract, under your account, with a rule that
              names <strong>only {accountId}</strong>. The enclave will open it for your runs and for
              nobody else&apos;s.
            </p>
            <p>
              When you want your agent to send mail, you add its account to that rule on the{' '}
              <a className="underline" href="/secrets">secrets page</a> — with an expiry, if you want
              the access to lapse on its own. You can take it back at any time, and the credential
              never leaves your row while you do.
            </p>
          </div>
          <PolicyEditor schema={gmailPolicy} value={policy} onChange={setPolicy} disabled={stage === 'storing'} />
          <button
            onClick={finish}
            disabled={stage === 'storing' || policyErrors.length > 0}
            className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {stage === 'storing' ? 'Waiting for your wallet…' : 'Finish: store the encrypted key on the contract'}
          </button>
          {stage === 'storing' && <p className="text-xs text-gray-500">Approve the transaction in your wallet.</p>}
        </>
      )}

      {stage === 'done' && (
        <div className="space-y-4">
          <div className="rounded border border-green-300 bg-green-50 p-4">
            <p className="font-medium text-green-800">Gmail connected.</p>
            <p className="mt-1 text-sm text-green-900">
              Your credential is stored on the contract, encrypted. Only the keystore enclave can
              open it, and only for callers your rule admits — right now that is{' '}
              <strong>{accountId}</strong> and nobody else.
            </p>
            <p className="mt-1 text-sm text-green-900">{gmailPolicy.summarize(policy)}</p>
          </div>
          <div className="space-y-2 text-sm">
            <p>
              To let an agent send, add its account under Access on the row named{' '}
              <code>{PROFILE}</code> under <code>{projectId}</code>. It then names{' '}
              <code>{`{ account_id: "${accountId}", profile: "${PROFILE}" }`}</code> in its calls.
              Removing the row disconnects the account.
            </p>
          </div>
          <a href="/secrets" className="inline-block rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
            Open the secrets page
          </a>
          {txHash && <p className="text-xs text-gray-500">Transaction {txHash}</p>}
        </div>
      )}

      {/* ---------------- an existing connection ---------------- */}
      {loaded && stage === 'idle' && (
        <div className="space-y-4">
          <div className="rounded border border-green-300 bg-green-50 p-4 text-sm">
            <p className="font-medium text-green-800">Gmail is connected.</p>
            <p className="mt-1 text-green-900">
              Since {connectedSince?.toLocaleDateString()}
              {updatedAt && updatedAt.getTime() !== connectedSince?.getTime() ? `, last updated ${updatedAt.toLocaleDateString()}` : ''}.
              Who may use it: {formatAccessCondition(loaded.access)}.{' '}
              <a className="underline" href={`/secrets?project=${encodeURIComponent(projectId)}&profile=${PROFILE}`}>Manage access</a>
            </p>
          </div>

          {saved && (
            <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
              {saved}
            </div>
          )}

          {/* ---- the policy ---- */}
          <div className="space-y-3">
            {!policyRead && (
              <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
                <p className="font-medium">Your policy is stored sealed, together with the credential.</p>
                <p>
                  Only the keystore enclave can open it, so this page cannot read it back. The one
                  door into the enclave is running the connector, and on chain a run is a
                  transaction: it attaches 0.1 NEAR, keeps the run&apos;s cost — about 0.0013 NEAR —
                  and returns the rest. The connector answers with the policy sealed to a key this
                  page has just created and never sends anywhere, so the chain records only
                  ciphertext.
                </p>
                <button
                  onClick={readPolicy}
                  disabled={busy}
                  className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {reading ? 'Waiting for your wallet…' : 'Show current policy (one transaction)'}
                </button>
                <p className="text-xs text-muted-foreground">
                  Or set a new one without reading it — what you save below replaces whatever is stored.
                </p>
              </div>
            )}

            {policyRead && !policyRead.present && (
              <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                The connector reports <strong>no policy at all</strong> in this row, so nothing can be sent
                from it until one is saved. The line below is what saving would set.
              </p>
            )}

            {policyRead && (
              <p className="text-xs text-muted-foreground">
                Read from the connector just now. {policyRead.sentToday} message{policyRead.sentToday === 1 ? '' : 's'} sent today
                by you — each caller has its own daily counter, and your agent&apos;s is not this one.
                {policyRead.unknownKeys.length > 0 && (
                  <>
                    {' '}The stored policy also has {policyRead.unknownKeys.map((k) => <code key={k}>{k}</code>)} — a key this
                    connector does not know, which makes it refuse to send. Saving from here drops it.
                  </>
                )}
              </p>
            )}

            <PolicyEditor schema={gmailPolicy} value={policy} onChange={setPolicy} disabled={busy} defaultOpen={!!policyRead} />

            {updateStage === 'idle' || (updateStage === 'signing' && update?.keys.GMAIL_POLICY !== undefined) ? (
              <button
                onClick={() => beginUpdate({ keys: { GMAIL_POLICY: toJson(gmailPolicy, policy) }, label: 'Policy saved.' })}
                disabled={busy || policyErrors.length > 0}
                className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {updateStage === 'signing' ? 'Waiting for your signature…' : 'Save policy: sign, then store'}
              </button>
            ) : null}
          </div>

          {/* ---- the credential ---- */}
          <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
            <p className="font-medium">Reconnect the Google account</p>
            <p>
              If Google has revoked the token — the agent reports <code>credential_expired</code> —
              or you want to connect a different mailbox. A new consent, then one signature and one
              transaction; the policy you have stays as it is.
            </p>
            {!reconnectToken ? (
              <button onClick={() => consent('reconnect')} disabled={!clientId || busy} className="rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">
                Reconnect Google account
              </button>
            ) : updateStage === 'idle' ? (
              <button
                onClick={() => beginUpdate({ keys: { GMAIL_REFRESH_TOKEN: reconnectToken }, label: 'Google account reconnected.' })}
                disabled={busy}
                className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                Google granted a new credential — sign to put it in your row
              </button>
            ) : null}
          </div>

          {/* ---- step two of any update ---- */}
          {(updateStage === 'ready-to-store' || updateStage === 'storing') && (
            <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
              <p className="font-medium">Signed. The keystore has re-sealed your row with the change merged in.</p>
              {pendingSummary && (
                <p>
                  It holds {pendingSummary.total} key{pendingSummary.total === 1 ? '' : 's'}
                  {pendingSummary.updated.length > 0 && (
                    <>
                      ; changed: {pendingSummary.updated.map((k) => <code key={k}>{k}</code>).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}
                    </>
                  )}
                  .
                </p>
              )}
              <p>
                Nothing is on chain yet. One transaction stores the re-sealed row under the same
                rule it has now — {formatAccessCondition(loaded.access)}. The storage deposit is quoted
                again for the new size; what the row already holds counts toward it, and the
                difference is returned.
              </p>
              <button
                onClick={storeUpdate}
                disabled={updateStage === 'storing'}
                className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {updateStage === 'storing' ? 'Waiting for your wallet…' : 'Store on contract'}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default function ConnectGmailPage() {
  return (
    <RequireWallet>
      <Suspense>
        <ConnectGmail />
      </Suspense>
    </RequireWallet>
  );
}
