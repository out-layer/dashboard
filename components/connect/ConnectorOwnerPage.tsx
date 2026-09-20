'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { actionCreators } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { PolicyEditor } from '@/components/policy/PolicyEditor';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { bytesToHex, eciesEncrypt, generateReplyKeypair, hexToBytes, openReply } from '@/lib/ecies';
import { waitForTransactionOutcome } from '@/lib/near-rpc';
import { emptyValue, fromJson, toJson, validate } from '@/lib/policies/policy';
import type { PolicySchema, PolicyValue } from '@/lib/policies/types';
import { formatAccessCondition } from '@/app/secrets/components/utils';
import { isImplicitAccount, shortAccount } from '@/lib/short-account';
import { shortKey } from '@/lib/short-key';

/**
 * The owner's page of a connector: connecting an account, and looking after the
 * connection afterwards. One component for every connector whose credential a
 * person stores; a connector supplies a {@link ConnectorSpec} and gets the
 * whole page.
 *
 * It exists as ONE component because every rule below was learnt from a failure
 * that is invisible until it happens to a real user, and a second page written
 * by hand forgets at least one of them. `app/connect/gmail` is where they were
 * learnt; its header states the same rules in the same order.
 *
 * ## The wallet
 *
 * 1. **A wallet opens from a click and from nothing else.** Not from an effect,
 *    a promise chain, a redirect callback or a timer. Browsers only treat a real
 *    click as a user gesture, and a wallet opened otherwise fails on its own
 *    internals (Meteor answers `reading 'M_ID'`) — an error nobody can act on.
 * 2. **Split the flow AT the signature.** Do every unsigned thing first — the
 *    fetches, the key exchange — then STOP and render what happened and what the
 *    transaction will do. The action goes in the button's label.
 * 3. **A refused or closed wallet returns to that screen, not to the start.**
 *    Whatever was already obtained stays in hand, so a second attempt costs one
 *    click and not another trip through a provider's consent.
 * 4. **When a change needs two wallet steps, the second one is the whole
 *    screen**: numbered, saying in plain words that nothing is saved yet, with
 *    one button. It is the exact place a person believes they are finished.
 *
 * ## Reading what is stored
 *
 * 5. **The page cannot read a secret back, and must not pretend otherwise.** The
 *    only door into a row is running the connector, which on chain is a
 *    transaction; the connector seals its answer to a one-time key made here.
 * 6. **So state is loaded on demand, behind a button — never on page load**, and
 *    never described before it is loaded. A write that replaces state nobody has
 *    read is allowed, and says so in the button's own label.
 * 7. **A wallet that signs on its own page comes back by redirect**, to a page
 *    that remembers nothing. The reply key outlives that trip in
 *    `sessionStorage`, and the outcome is fetched by hash from the RPC.
 *
 * ## What the reader sees
 *
 * 8. **The default view is the task.** Explanation lives behind `<More>`.
 * 9. **Rare actions go last and closed** (reconnecting a provider), and expand
 *    themselves only when something is actually pending in them.
 * 10. **No long identifier is printed in full mid-sentence.**
 *
 * ## Storing safely
 *
 * 11. **A first connection re-checks the row before storing**: a tab left open
 *     from before another one connected would otherwise reset an existing row.
 * 12. **An update never rewrites what it did not mean to.** It merges through the
 *     keystore, keeps the row's access rule and vault binding, and refuses a
 *     result that came back missing the keys it should have preserved — the
 *     keystore starts from an EMPTY row when it cannot read the stored one.
 * 13. **Check the connector is published on this network before offering to
 *     connect.** Nothing downstream does, and the deposit would buy a credential
 *     nothing can ever read.
 *
 * ## The provider's callback
 *
 * 14. **A callback is honoured once, and only with the `state` this tab made.**
 *     A `code` that arrives without it — a link somebody sent, or a flow started
 *     on the provider's own site — is not exchanged. The code leaves the address
 *     bar before anything else happens, so a reload cannot retry it.
 * 15. **The credential exists in this tab's memory and nowhere else** until the
 *     owner's transaction: not in storage, not in a URL, not in an error.
 * 16. **Every trip to the provider is one the provider brings back — by its own
 *     documented mechanism, not one invented here.** A provider's "install" or
 *     "configure" page returns only if the provider was told where to (GitHub: a
 *     Setup URL with "Redirect on update"); sent there without that, a person is
 *     stranded on somebody else's site with nothing stored. The return carries
 *     no credential and nothing in it is to be trusted — the tab's memory is
 *     gone too (rule 15) — so the page answers it by running the authorisation
 *     again, which a provider completes without a screen for someone who has
 *     authorised before. See `providerReturn`.
 * 17. **What is asked of the provider's API from the browser is asked uncached.**
 *     GitHub answers with `max-age=60`, and a page that re-reads "what does this
 *     credential reach" inside that minute shows the owner the answer from
 *     before they changed it.
 */
export interface ConnectorSpec {
  /** The route segment and the connector id: `/connect/{id}`. */
  id: string;
  /** The provider, as a person calls it: "GitHub". */
  provider: string;
  title: string;
  description: string;
  /** The curated project, per network. */
  projects: Record<'testnet' | 'mainnet', string>;
  /** The profile an agent names in `secrets_ref`. */
  profile: string;
  /** The key the credential is stored under. */
  credentialKey: string;
  policy: PolicySchema;
  /** Whether this deployment can start the provider's flow at all, and what to say when it cannot. */
  configured: boolean;
  notConfigured: string;

  /** Where the provider's consent starts. `state` comes back on the callback. */
  consentUrl(args: { mode: 'connect' | 'reconnect'; state: string; redirectUri: string }): string;
  /** The provider's own refusal on the callback, in the owner's words — or null when there is none. */
  callbackRefusal(params: URLSearchParams): string | null;
  /** Whether the callback carries something to exchange. */
  hasCredentialIn(params: URLSearchParams): boolean;
  /** The callback's parameters into a credential. Runs with no wallet involved. */
  exchange(params: URLSearchParams, redirectUri: string): Promise<string>;
  /**
   * What the credential turned out to be, shown BEFORE anything is stored — who
   * it acts as, what it reaches — and a policy to start the editor from. Best
   * effort: a failure here is not a reason to refuse the connection.
   */
  inspect?(credential: string): Promise<CredentialView | null>;
  /**
   * The provider sending the owner back after a step done on ITS pages — an app
   * installed, repositories changed (rule 16). Not a credential and not to be
   * trusted; it says only that the owner was just there. `resume`: a first
   * connection carries on by authorising again; a connected account needs
   * nothing stored, and is told `note`.
   */
  providerReturn?(params: URLSearchParams): { resume: boolean; note: string } | null;

  /** Before the first click: what the provider is about to ask, and what this connector can and cannot do. */
  intro: React.ReactNode;
  connectLabel: string;
  reconnectLabel: string;
  reconnectWhy: React.ReactNode;
  /** After "connected": what still has to happen before an agent can use it. */
  grantHint: string;
  /** A count the connector's `status` reports beside the policy, and how to say it. */
  usage?: { key: string; say(count: number): string };
  /** Anything the provider needs looked after outside this page — e.g. which repositories an app reaches. */
  connectedExtra?: React.ReactNode;
}

/** What a credential turned out to be. */
export interface CredentialView {
  label: string;
  starting?: PolicyValue;
  /**
   * Something the owner does on the provider's own pages — choosing which
   * repositories an app reaches. The provider brings them back (rule 16) and
   * the page picks the connection up again. `urgent` when nothing works until
   * it is done.
   */
  todo?: { urgent: boolean; text: string; href: string; linkLabel: string };
}

const REPLY_TTL_MS = 10 * 60 * 1000;
/** What the keystore's NEP-413 check expects as the recipient — the same string the secrets page signs for. */
const KEYSTORE_RECIPIENT = 'keystore.outlayer.near';
/** The connector's own words in a `status` policy answer, beside the policy's fields. */
const STATUS_META_KEYS = new Set(['present', 'effect', 'readable', 'error']);

type Stage = 'idle' | 'preparing' | 'ready' | 'storing' | 'done';
type Update = { keys: Record<string, string>; label: string };
type UpdateStage = 'idle' | 'signing' | 'ready-to-store' | 'storing';

interface Row {
  access: unknown;
  created_at: number;
  updated_at: number;
}

/** Who may use the row, as chips; an agent's 64-character account is shown short (rule 10). */
function AccessChips({ access }: { access: unknown }) {
  const accounts = (access as { Whitelist?: { accounts?: unknown } } | null)?.Whitelist?.accounts;
  if (!Array.isArray(accounts)) return <span>{formatAccessCondition(access)}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {accounts.map((a) => (
        <span key={String(a)} title={String(a)} className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-xs">
          {isImplicitAccount(String(a)) ? '🤖 ' : ''}
          {shortAccount(String(a))}
        </span>
      ))}
    </span>
  );
}

/** Detail a reader may want and does not need: closed until asked for (rule 8). */
export function More({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">{label}</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

export function ConnectorOwnerPage({ spec }: { spec: ConnectorSpec }) {
  const { accountId, signAndSendTransaction, signMessage, contractId, viewMethod, network, rpcUrl } = useNearWallet();
  const params = useSearchParams();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const route = `/connect/${spec.id}`;
  const STATE_KEY = `outlayer:connect:${spec.id}:state`;
  const MODE_KEY = `outlayer:connect:${spec.id}:mode`;
  const REPLY_KEY = `outlayer:connect:${spec.id}:reply`;
  const { profile, credentialKey } = spec;
  const policyKey = spec.policy.envKey;

  const [error, setError] = useState<string | null>(null);

  // ---- the row this account holds, if any ------------------------------
  /** `'unknown'`: the contract could not be read — neither "connected" nor "not yet" may be shown. */
  const [row, setRow] = useState<Row | null | 'loading' | 'unknown'>('loading');
  const [published, setPublished] = useState<boolean | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);

  // ---- a first connection ---------------------------------------------
  const [stage, setStage] = useState<Stage>('idle');
  /** The provider's credential, held until the owner signs (rule 15). */
  const [credential, setCredential] = useState<string | null>(null);
  const [credentialView, setCredentialView] = useState<CredentialView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowPubkey, setRowPubkey] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const attempted = useRef(false);

  // ---- the policy, as this page knows it ------------------------------
  const [policy, setPolicy] = useState<PolicyValue>(emptyValue());
  const [policyRead, setPolicyRead] = useState<{ origin: 'read' | 'saved'; present: boolean; used: number; unknownKeys: string[] } | null>(null);
  const [reading, setReading] = useState(false);

  // ---- an update of an existing row: sign, then store -----------------
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateStage, setUpdateStage] = useState<UpdateStage>('idle');
  const [pendingCiphertext, setPendingCiphertext] = useState<string | null>(null);
  const [pendingSummary, setPendingSummary] = useState<{ total: number; updated: string[] } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** A new credential for an existing row, waiting for the owner's signature. */
  const [reconnectCredential, setReconnectCredential] = useState<string | null>(null);

  const projectId = spec.projects[network] ?? spec.projects.testnet;
  // The provider matches this against its registered list byte for byte, and
  // the same string is sent again at the exchange.
  const redirectUri = useMemo(() => (typeof window === 'undefined' ? '' : `${window.location.origin}${route}`), [route]);

  // The accessor has TWO shapes and they are not interchangeable: the
  // coordinator's enum is internally tagged (`#[serde(tag = "type")]`), the
  // contract's is externally tagged. One where the other is expected is a 422
  // with nothing in it to explain itself.
  const forCoordinator = useMemo(() => ({ type: 'Project', project_id: projectId }), [projectId]);
  const forContract = useMemo(() => ({ Project: { project_id: projectId } }), [projectId]);

  const policyErrors = validate(spec.policy, policy);
  const loaded: Row | null = typeof row === 'object' ? row : null;

  // ---- read the row -----------------------------------------------------
  const loadRow = useCallback(async () => {
    if (!accountId) return;
    try {
      const [found, vault, project] = await Promise.all([
        viewMethod({ contractId, method: 'get_secrets', args: { accessor: forContract, profile, owner: accountId } }),
        viewMethod({ contractId, method: 'get_secret_vault', args: { accessor: forContract, profile, owner: accountId } }),
        viewMethod({ contractId, method: 'get_project', args: { project_id: projectId } }),
      ]);
      setRow(found && typeof found === 'object' ? (found as Row) : null);
      setVaultId(typeof vault === 'string' ? vault : null);
      setPublished(!!(project && typeof project === 'object' && (project as { active_version?: string }).active_version));
    } catch (e) {
      // Not `null`: that would offer a first connection to an account that may
      // well be connected, and the refusal would come only after the provider.
      setRow('unknown');
      setError(`Could not read the contract: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [accountId, contractId, forContract, profile, projectId, viewMethod]);

  useEffect(() => {
    void loadRow();
  }, [loadRow]);

  // ---- the provider's consent -------------------------------------------
  const consent = useCallback(
    (mode: 'connect' | 'reconnect') => {
      const state = crypto.randomUUID();
      sessionStorage.setItem(STATE_KEY, state);
      sessionStorage.setItem(MODE_KEY, mode);
      window.location.href = spec.consentUrl({ mode, state, redirectUri });
    },
    [MODE_KEY, STATE_KEY, redirectUri, spec],
  );

  /** A first connection, step one: the row's key is fetched for a credential in
   *  hand. No wallet, no signature, nothing on chain yet. */
  const prepareWithCredential = useCallback(
    async (secret: string) => {
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
            secrets_json: JSON.stringify({ [credentialKey]: secret, [policyKey]: '{}' }),
          }),
        });
        if (!pubkeyResponse.ok) throw new Error(await pubkeyResponse.text());
        const { pubkey } = await pubkeyResponse.json();
        // What it is, before it is stored. Never a reason to fail: a provider's
        // API being slow must not cost the owner the consent they just gave.
        const seen = (await spec.inspect?.(secret).catch(() => null)) ?? null;
        setCredentialView(seen);
        if (seen?.starting) setPolicy(seen.starting);
        setCredential(secret);
        setRowPubkey(pubkey);
        setStage('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStage('idle');
      }
    },
    [accountId, coordinatorUrl, credentialKey, forCoordinator, policyKey, spec],
  );

  // A reconnect whose row is gone by the time the provider answers has a
  // credential and nowhere to merge it. It becomes a first connection.
  useEffect(() => {
    if (row === null && reconnectCredential && stage === 'idle') {
      const secret = reconnectCredential;
      setReconnectCredential(null);
      void prepareWithCredential(secret);
    }
  }, [row, reconnectCredential, stage, prepareWithCredential]);

  /** A first connection, step two, from a click: seal credential and policy, then one transaction. */
  const finish = useCallback(async () => {
    if (!credential || !rowPubkey) return;
    setError(null);
    setStage('storing');
    try {
      // Values are strings: a secret row is `HashMap<String, String>`, so the
      // policy travels as JSON text.
      const secretsJson = JSON.stringify({ [credentialKey]: credential, [policyKey]: toJson(spec.policy, policy) });
      const sealed = Buffer.from(eciesEncrypt(rowPubkey, new TextEncoder().encode(secretsJson))).toString('base64');
      // Yours alone until you grant an agent. A connector row left open would
      // let anyone who names it act as you.
      const args = {
        accessor: forContract,
        profile,
        encrypted_secrets_base64: sealed,
        access: { Whitelist: { accounts: [accountId] } },
        vault_id: null,
      };
      if (published === false) {
        throw new Error(`The ${spec.provider} connector is not published on ${network}, so a credential stored here could never be read. Switch networks and start again.`);
      }
      const existing = await viewMethod({ contractId, method: 'get_secrets', args: { accessor: forContract, profile, owner: accountId } });
      if (existing) {
        throw new Error(`This account already has a ${spec.provider} row. Reload the page and use "${spec.reconnectLabel}" to put the new credential in it.`);
      }
      const cost = await viewMethod({ contractId, method: 'estimate_storage_cost', args: { ...args, owner: accountId } });
      if (!cost) throw new Error('The contract would not quote the storage cost.');
      const response = await signAndSendTransaction({
        receiverId: contractId,
        actions: [actionCreators.functionCall('store_secrets', args, BigInt('50000000000000'), BigInt(String(cost)))],
      });
      setTxHash(response?.transaction?.hash ?? null);
      setCredential(null);
      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Back to `ready`, not to the start (rule 3).
      setStage('ready');
    }
  }, [accountId, contractId, credential, credentialKey, forContract, network, policy, policyKey, profile, published, rowPubkey, signAndSendTransaction, spec, viewMethod]);

  // ---- an existing row: read the policy by running the connector ----------
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
      const opened = JSON.parse(new TextDecoder().decode(openReply(secretKey, Buffer.from(sealed, 'base64')))) as Record<string, unknown>;
      if (opened.readable === false) {
        throw new Error(`The stored policy cannot be read by the connector: ${String(opened.error)}. Save a new one below.`);
      }
      const fieldsOnly = Object.fromEntries(Object.entries(opened).filter(([k]) => !STATUS_META_KEYS.has(k)));
      const { value, unknownKeys } = fromJson(spec.policy, fieldsOnly);
      setPolicy(opened.present === false ? emptyValue() : value);
      setPolicyRead({
        origin: 'read',
        present: opened.present !== false,
        used: spec.usage ? Number(env.output?.[spec.usage.key] ?? 0) : 0,
        unknownKeys,
      });
      setSaved(null);
    },
    [spec],
  );

  /** From a click: one transaction runs `status` with a key made here; the
   *  policy comes back sealed to it and is opened in this page.
   *
   *  TODO(global payment key): when the dashboard holds a payment key for the
   *  signed-in account, read over HTTPS instead — `POST /call/{project}` with
   *  `X-Payment-Key`, the same `reply_pubkey` and `secrets_ref` — and keep this
   *  transaction as the fallback. */
  const readPolicy = useCallback(async () => {
    if (!accountId) return;
    setError(null);
    setReading(true);
    try {
      const reply = generateReplyKeypair();
      sessionStorage.setItem(REPLY_KEY, JSON.stringify({ sec: bytesToHex(reply.secretKey), at: Date.now() }));
      const args = {
        source: { Project: { project_id: projectId, version_key: null } },
        resource_limits: { max_instructions: 10000000000, max_memory_mb: 128, max_execution_seconds: 60 },
        input_data: JSON.stringify({ operation: 'status', reply_pubkey: reply.publicKeyHex }),
        response_format: 'Json',
        secrets_ref: { account_id: accountId, profile },
      };
      const result = await signAndSendTransaction({
        receiverId: contractId,
        actions: [actionCreators.functionCall('request_execution', args, BigInt('300000000000000'), BigInt('100000000000000000000000'))],
      });
      sessionStorage.removeItem(REPLY_KEY);
      openAnswer(result, reply.secretKey);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        /timeout|timed out/i.test(message)
          ? 'The wallet stopped waiting before the connector answered; the run still completes on its own. Try again — it is the same 0.1 NEAR round trip.'
          : message,
      );
      sessionStorage.removeItem(REPLY_KEY);
    } finally {
      setReading(false);
    }
  }, [REPLY_KEY, accountId, contractId, openAnswer, profile, projectId, signAndSendTransaction]);

  // Back from a wallet that signs on its own page (rule 7).
  useEffect(() => {
    if (!accountId) return;
    const url = new URLSearchParams(window.location.search);
    const hashes = url.get('transactionHashes');
    const errorCode = url.get('errorCode');
    if (!hashes && !errorCode) return;
    window.history.replaceState({}, '', route);
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
  }, [REPLY_KEY, accountId, loadRow, openAnswer, route, rpcUrl]);

  // ---- an existing row: merge new keys into it -----------------------------
  /** Step one, from a click: the owner signs, the keystore re-seals the row. Nothing on chain yet. */
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
        const message = `Update Outlayer secrets for ${accountId}:${profile}\nkeys:${keys.join(',')}`;
        const signed = await signMessage({ message, recipient: KEYSTORE_RECIPIENT, nonce });
        if (!signed) throw new Error('The signature was not given, so nothing changed.');
        const response = await fetch(`${coordinatorUrl}/secrets/update_user_secrets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessor: forCoordinator,
            profile,
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
          if (/public key/i.test(why)) why += ` — this wallet signed with "${shortKey(signed.publicKey)}".`;
          throw new Error(why);
        }
        const answer = await response.json();
        const total = Number(answer?.summary?.total_keys ?? 0);
        const updated: string[] = Array.isArray(answer?.summary?.updated_keys) ? answer.summary.updated_keys : [];
        // Rule 12. A connected row holds the credential and the policy; a
        // result with fewer keys than that would drop one of them when stored.
        if (total < 2) {
          throw new Error(
            `The keystore re-sealed a row with ${total} key${total === 1 ? '' : 's'}, so part of your row would not survive — nothing was stored. Try again in a moment; if it repeats, the keystore cannot see this row yet.`,
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
    [accountId, coordinatorUrl, forCoordinator, profile, signMessage],
  );

  /** Step two, from a click: the re-sealed row goes on chain, under the rule it already has. */
  const storeUpdate = useCallback(async () => {
    if (!pendingCiphertext || !update || !loaded) return;
    setError(null);
    setUpdateStage('storing');
    try {
      const args = { accessor: forContract, profile, encrypted_secrets_base64: pendingCiphertext, access: loaded.access, vault_id: vaultId };
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
      setReconnectCredential(null);
      // Written, not read: certain about the policy, silent about anything the
      // connector alone could tell us.
      if (policyKey in update.keys) setPolicyRead({ origin: 'saved', present: true, used: 0, unknownKeys: [] });
      void loadRow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // The re-sealed row is still in hand: one more click, not another signature.
      setUpdateStage('ready-to-store');
    }
  }, [accountId, contractId, forContract, loadRow, loaded, pendingCiphertext, policyKey, profile, signAndSendTransaction, update, vaultId, viewMethod]);

  // ---- back from the provider (rule 14) -----------------------------------
  useEffect(() => {
    const refusal = spec.callbackRefusal(params);
    if (refusal) {
      setError(refusal);
      return;
    }
    if (!accountId || attempted.current) return;
    // Rule 16: back from a step on the provider's own pages. Whatever else the
    // address carries — GitHub may add a `code` nobody here asked for — is not
    // used. Waits for the row: a connected account needs nothing stored, a
    // first connection carries on by authorising again, which is a navigation
    // and not a wallet (rule 1 is about wallets).
    const returned = spec.providerReturn?.(params) ?? null;
    if (returned) {
      if (row === 'loading') return;
      attempted.current = true;
      window.history.replaceState({}, '', route);
      if (returned.resume && row === null && spec.configured) consent('connect');
      else setNotice(returned.note);
      return;
    }
    if (!spec.hasCredentialIn(params)) return;
    // Once, and only once. Without this latch a failure inside the exchange
    // puts the stage back to idle, the effect runs again with the code still in
    // the URL, and the state check — whose value the first pass consumed —
    // reports "not from this tab" over the top of the real reason.
    attempted.current = true;
    const expected = sessionStorage.getItem(STATE_KEY);
    const mode = sessionStorage.getItem(MODE_KEY) ?? 'connect';
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(MODE_KEY);
    const callback = new URLSearchParams(params.toString());
    window.history.replaceState({}, '', route);
    if (!expected || callback.get('state') !== expected) {
      setError(`This callback did not come from a connection started in this tab, so it was not used. Press "${spec.connectLabel}" to start here.`);
      return;
    }
    setError(null);
    if (mode === 'reconnect') {
      spec
        .exchange(callback, redirectUri)
        .then((secret) => setReconnectCredential(secret))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
      return;
    }
    setStage('preparing');
    spec
      .exchange(callback, redirectUri)
      .then((secret) => prepareWithCredential(secret))
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setStage('idle');
      });
  }, [MODE_KEY, STATE_KEY, accountId, consent, params, prepareWithCredential, redirectUri, route, row, spec]);

  // ---- render -------------------------------------------------------------
  const busy = updateStage === 'signing' || updateStage === 'storing' || reading;
  const connectedSince = loaded ? new Date(loaded.created_at / 1_000_000) : null;
  const updatedAt = loaded ? new Date(loaded.updated_at / 1_000_000) : null;
  const updatingPolicy = update ? policyKey in update.keys : false;

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title={spec.title} description={spec.description} />

      {!spec.configured && <p className="text-sm text-red-600">{spec.notConfigured}</p>}

      {notice && <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}

      {row === 'loading' && stage === 'idle' && <p className="text-sm text-muted-foreground">Checking whether this account is connected…</p>}

      {row === 'unknown' && stage === 'idle' && (
        <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
          <p>Whether this account is connected could not be read from the contract just now.</p>
          <button
            onClick={() => {
              setError(null);
              setRow('loading');
              void loadRow();
            }}
            className="rounded border border-gray-300 px-4 py-2 text-sm"
          >
            Try again
          </button>
        </div>
      )}

      {published === false && stage === 'idle' && (
        <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
          <p className="font-medium">
            The {spec.provider} connector is not published on {network} yet.
          </p>
          <p className="text-muted-foreground">
            Connecting here would store a credential nothing can read — the project <code>{projectId}</code> does not exist on this
            network. Switch the network at the top of the page, or come back when it is published.
          </p>
          {row && <p className="text-muted-foreground">Your stored row is still here and is not affected.</p>}
        </div>
      )}

      {/* ---------------- a first connection ---------------- */}
      {published !== false && row === null && stage === 'idle' && !reconnectCredential && (
        <>
          <div className="text-sm space-y-2">{spec.intro}</div>
          <button onClick={() => consent('connect')} disabled={!spec.configured} className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50">
            {spec.connectLabel}
          </button>
        </>
      )}

      {stage === 'preparing' && <p className="text-sm">Getting the credential from {spec.provider}…</p>}

      {(stage === 'ready' || stage === 'storing') && (
        <>
          <div className="rounded border-2 border-amber-400 bg-amber-50 p-4 text-sm space-y-2">
            <p className="font-medium text-amber-900">{spec.provider} has granted the credential. Nothing is saved yet.</p>
            {credentialView && <p className="text-amber-900">{credentialView.label}</p>}
            {credentialView?.todo && (
              <p className={credentialView.todo.urgent ? 'rounded border border-amber-500 bg-white/70 p-3 font-medium text-amber-900' : 'text-amber-900'}>
                {credentialView.todo.text}{' '}
                <a className="underline" href={credentialView.todo.href}>
                  {credentialView.todo.linkLabel}
                </a>
              </p>
            )}
            <p className="text-amber-900">
              Choose what the agent may do, then press the button: your browser encrypts the credential and one transaction stores it
              under <strong>{accountId}</strong>, readable by you alone.
            </p>
            <More label="Who can read it, and how do I give an agent access?">
              <p>It is sealed to a key whose private half exists only inside the keystore enclave — not on our servers, and not in this page.</p>
              <p>
                To let an agent use it you add its account on the{' '}
                <a className="underline" href="/secrets">
                  secrets page
                </a>
                , with an expiry if you want the access to lapse on its own. You can take it back at any time.
              </p>
            </More>
          </div>
          <PolicyEditor schema={spec.policy} value={policy} onChange={setPolicy} disabled={stage === 'storing'} defaultOpen />
          <button onClick={finish} disabled={stage === 'storing' || policyErrors.length > 0} className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50">
            {stage === 'storing' ? 'Waiting for your wallet…' : 'Finish: store the encrypted credential on the contract'}
          </button>
          {stage === 'storing' && <p className="text-xs text-gray-500">Approve the transaction in your wallet.</p>}
        </>
      )}

      {stage === 'done' && (
        <div className="space-y-4">
          <div className="rounded border border-green-300 bg-green-50 p-4 text-sm">
            <p className="font-medium text-green-800">{spec.provider} connected.</p>
            <p className="mt-1 text-green-900">
              {spec.policy.summarize(policy)} {spec.grantHint}
            </p>
          </div>
          <a href="/secrets" className="inline-block rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
            Grant an agent access
          </a>
          <More label="Where the credential lives, and what an agent names">
            <p>
              Row <code>{profile}</code> under <code>{projectId}</code>, encrypted, readable by <strong>{accountId}</strong> alone until you add
              someone under Access. An agent you granted names <code>{`{ account_id: "${accountId}", profile: "${profile}" }`}</code> in its
              calls. Removing the row disconnects the account.
            </p>
            {txHash && <p>Transaction {txHash}</p>}
          </More>
        </div>
      )}

      {/* ---------------- an existing connection ---------------- */}
      {published !== false && loaded && stage === 'idle' && (
        <div className="space-y-4">
          <div className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
            <span className="font-medium text-green-800">{spec.provider} is connected.</span> Who may use it: <AccessChips access={loaded.access} />{' '}
            <a className="underline" href={`/secrets?project=${encodeURIComponent(projectId)}&profile=${profile}`}>
              Manage access
            </a>
          </div>

          {saved && <div className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">✓ {saved}</div>}

          {/* Rule 4: while a signed change waits for its transaction, this block IS the page. */}
          {updateStage === 'ready-to-store' || updateStage === 'storing' ? (
            <div className="rounded border-2 border-amber-400 bg-amber-50 p-4 text-sm space-y-3">
              <p className="text-base font-semibold text-amber-900">Step 2 of 2 — not saved yet</p>
              <p className="text-amber-900">
                Your signature only encrypted the new {updatingPolicy ? 'policy' : 'credential'}. It takes effect when you save it on chain.
              </p>
              <button onClick={storeUpdate} disabled={updateStage === 'storing'} className="rounded bg-[#cc6600] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {updateStage === 'storing' ? 'Waiting for your wallet…' : 'Save on chain'}
              </button>
              <More label="What does this transaction do?">
                {pendingSummary && (
                  <p>
                    The keystore re-sealed your row with the change merged in: {pendingSummary.total} key{pendingSummary.total === 1 ? '' : 's'}
                    {pendingSummary.updated.length > 0 ? `, changed: ${pendingSummary.updated.join(', ')}` : ''}.
                  </p>
                )}
                <p>
                  One transaction stores it under the access rule it has now. The storage deposit is quoted again for the new size; what the
                  row already holds counts toward it, and the difference is returned.
                </p>
              </More>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {policyRead?.origin === 'read' && !policyRead.present && (
                  <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    The connector reports <strong>no policy at all</strong> in this row.
                  </p>
                )}

                <PolicyEditor
                  key={policyRead ? 'read' : 'unread'}
                  schema={spec.policy}
                  value={policy}
                  onChange={setPolicy}
                  disabled={busy}
                  defaultOpen={!!policyRead}
                  headline={policyRead ? undefined : 'not loaded — what you save replaces what is stored'}
                />

                {policyRead?.origin === 'read' && policyRead.unknownKeys.length > 0 && (
                  <p className="text-xs text-amber-800">
                    The stored policy also has {policyRead.unknownKeys.join(', ')} — a key this connector does not know, which makes it refuse to
                    act. Saving from here drops it.
                  </p>
                )}

                {!policyRead && (
                  <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    You have not read the policy stored now. Saving replaces it — whatever it allows — with what is in the form above.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {policyRead?.origin !== 'read' && (
                    <button onClick={readPolicy} disabled={busy} className="rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">
                      {reading ? 'Waiting for your wallet…' : 'Load current policy'}
                    </button>
                  )}
                  <button
                    onClick={() => beginUpdate({ keys: { [policyKey]: toJson(spec.policy, policy) }, label: 'Policy saved.' })}
                    disabled={busy || policyErrors.length > 0}
                    className={`rounded px-4 py-2 text-sm text-white disabled:opacity-50 ${policyRead ? 'bg-[#cc6600]' : 'bg-red-700 hover:bg-red-800'}`}
                  >
                    {updateStage === 'signing' && updatingPolicy ? 'Waiting for your signature…' : policyRead ? 'Update policy' : 'Yes, overwrite the stored policy'}
                  </button>
                </div>

                {!policyRead && (
                  <More label="Why does loading the policy need a transaction?">
                    <p>
                      Your policy is stored sealed, together with the credential, and only the keystore enclave can open it — this page cannot
                      read it back. The one door into the enclave is running the connector, and on chain a run is a transaction: it attaches 0.1
                      NEAR, keeps the run&apos;s cost — about 0.0013 NEAR — and returns the rest.
                    </p>
                    <p>
                      The connector answers with the policy sealed to a key this page has just created and never sends anywhere, so the chain
                      records only ciphertext.
                    </p>
                  </More>
                )}
                {policyRead && (
                  <p className="text-xs text-muted-foreground">
                    {policyRead.origin === 'read'
                      ? 'Loaded from the connector just now.'
                      : 'Saved just now — this is what the row holds; load it to see what the connector reads back.'}{' '}
                    Saving takes two steps: a signature, then one transaction.
                  </p>
                )}
              </div>

              {spec.connectedExtra && <div className="border-t border-gray-200 pt-3 text-sm">{spec.connectedExtra}</div>}

              {/* Rule 9: reconnecting is rare, so it sits last and closed — unless a
                  new credential is already in hand, when it opens itself. */}
              <div className="border-t border-gray-200 pt-3 space-y-3">
                {reconnectCredential ? (
                  <div className="rounded border-2 border-amber-400 bg-amber-50 p-4 text-sm space-y-2">
                    <p className="font-medium text-amber-900">{spec.provider} granted a new credential. It is not in your row yet.</p>
                    <button
                      onClick={() => beginUpdate({ keys: { [credentialKey]: reconnectCredential }, label: `${spec.provider} account reconnected.` })}
                      disabled={busy}
                      className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {updateStage === 'signing' ? 'Waiting for your signature…' : 'Sign to put it in your row'}
                    </button>
                  </div>
                ) : (
                  <More label={spec.reconnectLabel}>
                    <div className="space-y-2">{spec.reconnectWhy}</div>
                    <button onClick={() => consent('reconnect')} disabled={!spec.configured || busy} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-foreground disabled:opacity-50">
                      {spec.reconnectLabel}
                    </button>
                  </More>
                )}
                <More label="Connection details">
                  <p>
                    Row <code>{profile}</code> under <code>{projectId}</code>, connected {connectedSince?.toLocaleDateString()}
                    {updatedAt && updatedAt.getTime() !== connectedSince?.getTime() ? `, last updated ${updatedAt.toLocaleDateString()}` : ''}. An agent you
                    granted names <code>{`{ account_id: "${accountId}", profile: "${profile}" }`}</code> in its calls.
                  </p>
                  {spec.usage && policyRead?.origin === 'read' && (
                    <p>{spec.usage.say(policyRead.used)} — each caller has its own daily counter, and your agent&apos;s is not this one.</p>
                  )}
                </More>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
