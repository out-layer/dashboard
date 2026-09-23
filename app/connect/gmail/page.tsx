'use client';

import { shortKey } from '@/lib/short-key';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { actionCreators } from '@near-js/transactions';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { PolicyEditor } from '@/components/policy/PolicyEditor';
import { TrySending } from '@/components/connect/TrySending';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { bytesToHex, eciesEncrypt, generateReplyKeypair, hexToBytes, openReply } from '@/lib/ecies';
import { waitForTransactionOutcome } from '@/lib/near-rpc';
import { gmailPolicy } from '@/lib/policies/gmail';
import { emptyValue, fromJson, toJson, validate } from '@/lib/policies/policy';
import type { PolicyValue } from '@/lib/policies/types';
import { formatAccessCondition } from '@/app/secrets/components/utils';
import { isImplicitAccount, shortAccount } from '@/lib/short-account';

/**
 * Connecting a Gmail account, and looking after the connection afterwards.
 *
 * **This is the reference owner page for a connector.** Every connector whose
 * credential a person stores needs one, and every one of them faces the same
 * constraints. The rules below are what this page is shaped by; copy them with
 * the layout, because each exists for a failure that is invisible until it
 * happens to a real user.
 *
 * ## The wallet
 *
 * 1. **A wallet opens from a click and from nothing else.** Not from an effect,
 *    a promise chain, a redirect callback or a timer. Browsers only treat a real
 *    click as a user gesture, and a wallet opened otherwise fails on its own
 *    internals (Meteor answers `reading 'M_ID'`) — an error nobody can act on.
 * 2. **Split the flow AT the signature.** Do every unsigned thing first — the
 *    fetches, the key exchange — then STOP and render what happened and what the
 *    transaction will do: what is stored, under whose account, who can read it,
 *    how to undo it. The action goes in the button's label, never a bare
 *    "Confirm".
 * 3. **A refused or closed wallet returns to that screen, not to the start.**
 *    Whatever was already obtained stays in hand, so a second attempt costs one
 *    click and not another trip through a provider's consent.
 * 4. **When a change needs two wallet steps, the second one is the whole
 *    screen.** A signature that only re-sealed a row, with the transaction still
 *    to come, is the exact place a person believes they are finished and leaves.
 *    So: the rest of the page is hidden, the block is numbered ("Step 2 of 2"),
 *    it says in plain words that nothing is saved yet, and it carries one
 *    button. Detail goes behind a disclosure, not next to the button.
 *
 * ## Reading what is stored
 *
 * 5. **The page cannot read a secret back, and must not pretend otherwise.** A
 *    row is sealed to the keystore enclave; the only door into it is running the
 *    connector, which on chain is a transaction. The connector seals its answer
 *    to a one-time key made here, so the chain records ciphertext only.
 * 6. **So state is loaded on demand, behind a button — never on page load** (it
 *    costs the owner a transaction), and never described before it is loaded.
 *    Until then the editor says so rather than showing a default that looks like
 *    the truth. A write that replaces state nobody has read is allowed, and it
 *    says so in the button's own label: a person who never looked should not
 *    find out afterwards that they replaced something.
 * 7. **A wallet that signs on its own page comes back by redirect**, to a page
 *    that has been reloaded and remembers nothing. Anything the answer needs —
 *    here the reply key — must outlive that trip in `sessionStorage`, and the
 *    outcome is fetched by hash from the RPC.
 *
 * ## What the reader sees
 *
 * 8. **The default view is the task.** Explanation lives behind `<More>`
 *    disclosures. A person who came to change a setting should not have to read
 *    a page about enclaves to find the field.
 * 9. **Rare actions go last and closed** (reconnecting a provider), and expand
 *    themselves only when something is actually pending in them.
 * 10. **No long identifier is printed in full mid-sentence.** An agent's
 *     implicit account is 64 characters and a post-quantum key is thousands;
 *     both are shown short, with the whole value in a tooltip, so the eye can
 *     still tell one from another.
 *
 * ## Storing safely
 *
 * 11. **A first connection re-checks the row before storing.** A tab left open
 *     from before another one connected would otherwise reset an existing row's
 *     access rule and policy.
 * 12. **An update never rewrites what it did not mean to.** It merges through
 *     the keystore, keeps the row's existing access rule and vault binding, and
 *     refuses to store a result that came back missing the keys it should have
 *     preserved.
 * 13. **Check the connector is published on this network before offering to
 *     connect.** Nothing downstream does: the keystore derives a public key
 *     from a seed string, and the contract stores a row under any project id,
 *     existing or not. A page that skips this check takes a storage deposit for
 *     a credential nothing can ever read.
 *
 * ## This connector in particular
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
/** Set while a test message waits for a wallet that signs on its own page, so
 *  the return knows the transaction was a send and not a stored row. */
const TRY_KEY = 'outlayer:connect:gmail:try-send';

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

/** Who may use the row, as chips: a whitelist is the case this page writes, and
 *  an agent's 64-character account is shown short. Anything else falls back to
 *  the secrets page's one-line description. */
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

/** Detail a reader may want and does not need: closed until asked for (rule 8).
 *  Everything a page would otherwise say "just in case" belongs in one of
 *  these — the page then reads as the task, and the explanation is still one
 *  click away for whoever wants it. */
function More({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">{label}</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

function ConnectGmail() {
  const { accountId, signAndSendTransaction, signMessage, contractId, viewMethod, network, stablecoin } = useNearWallet();
  const params = useSearchParams();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [error, setError] = useState<string | null>(null);

  // ---- the row this account holds, if any ------------------------------
  /** `'unknown'`: the contract could not be read — neither "connected" nor "not yet" may be shown. */
  const [row, setRow] = useState<Row | null | 'loading' | 'unknown'>('loading');
  /** Whether this network has the connector at all (rule 13). */
  const [published, setPublished] = useState<boolean | null>(null);
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
  /** How the editor's value became known — `null` while it is only what this
   *  page has typed, and nothing about the stored policy is known at all.
   *  `read` is the connector's own answer; `saved` is what this page has just
   *  written, which is equally certain but says nothing about `sentToday`. */
  const [policyRead, setPolicyRead] = useState<
    { origin: 'read' | 'saved'; present: boolean; sentToday: number; unknownKeys: string[] } | null
  >(null);
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
      const [found, vault, project] = await Promise.all([
        viewMethod({ contractId, method: 'get_secrets', args: { accessor: forContract, profile: PROFILE, owner: accountId } }),
        viewMethod({ contractId, method: 'get_secret_vault', args: { accessor: forContract, profile: PROFILE, owner: accountId } }),
        viewMethod({ contractId, method: 'get_project', args: { project_id: projectId } }),
      ]);
      setRow(found && typeof found === 'object' ? (found as Row) : null);
      setVaultId(typeof vault === 'string' ? vault : null);
      setPublished(!!(project && typeof project === 'object' && (project as { active_version?: string }).active_version));
    } catch (e) {
      // Not `null`: that would offer a first connection to an account that may
      // well be connected, and the refusal would come only after Google.
      setRow('unknown');
      setError(`Could not read the contract: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [accountId, contractId, forContract, projectId, viewMethod]);

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
      // Rule 13, beside its sibling below rather than in the markup alone:
      // nothing downstream refuses a row stored for a project that does not
      // exist, so the deposit would buy a credential nothing can read.
      if (published === false) {
        throw new Error(`The Gmail connector is not published on ${network}, so a credential stored here could never be read. Switch networks and start again.`);
      }
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
  }, [accountId, contractId, forContract, network, policy, published, refreshToken, rowPubkey, signAndSendTransaction, viewMethod]);

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
      setPolicyRead({
        origin: 'read',
        present: opened.present !== false,
        sentToday: Number(env.output?.sent_today ?? 0),
        unknownKeys,
      });
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

  /** What a test message answered, when the wallet signed on its own page and
   *  the answer could only be read after the return. */
  const [triedSend, setTriedSend] = useState<{ messageId?: string; refusal?: string; error?: string } | null>(null);

  /** A priced operation paid on chain takes the price from a stablecoin balance
   *  the caller has deposited with the contract, and the contract refuses the
   *  call outright without it. Both numbers are read from the chain rather than
   *  written here: a price this page believed in would be wrong the day it
   *  moves, and the error would arrive from the contract as a panic. */
  const [onChainCost, setOnChainCost] = useState<{ price: string; balance: string } | null>(null);
  /** The chain could not be asked what a send costs. Worth saying: without the
   *  price the transaction carries no payment and the contract refuses it, with
   *  a panic that reads like a bug in this page. */
  const [costUnreadable, setCostUnreadable] = useState(false);
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    (async () => {
      try {
        const pricing = (await viewMethod({
          contractId,
          method: 'get_project_pricing',
          args: { project_id: projectId },
        })) as { operations?: Array<{ operation: string; price_usd: string }> } | null;
        const price = pricing?.operations?.find((o) => o.operation === 'send')?.price_usd;
        if (!price) {
          // An unpriced project: a transaction that attaches nothing is right.
          if (!cancelled) setCostUnreadable(false);
          return;
        }
        const balance = (await viewMethod({
          contractId,
          method: 'get_user_stablecoin_balance',
          args: { account_id: accountId },
        })) as string | null;
        if (!cancelled) {
          setOnChainCost({ price: String(price), balance: String(balance ?? '0') });
          setCostUnreadable(false);
        }
      } catch {
        if (!cancelled) setCostUnreadable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, contractId, projectId, viewMethod]);

  /** Reads a connector's answer out of a finished transaction. A send is not
   *  sealed: only `status` hides a policy, and there is no policy here. */
  const answerOf = useCallback((outcome: { status?: { SuccessValue?: string } } | null | undefined) => {
    const returned = outcome?.status?.SuccessValue;
    if (typeof returned !== 'string') throw new Error('The transaction finished without an answer from the connector.');
    let envelope: unknown = JSON.parse(Buffer.from(returned, 'base64').toString());
    if (typeof envelope === 'string') envelope = JSON.parse(envelope);
    const env = envelope as { success?: boolean; error?: string; output?: Record<string, unknown> };
    if (!env.success) return { refusal: env.error || 'refused' };
    return { messageId: env.output?.message_id ? String(env.output.message_id) : undefined };
  }, []);

  /** From the button's own click in the block below: one transaction sends one
   *  message. Nothing here runs on its own — a wallet opened from an effect or
   *  a timer fails inside the wallet with an error nobody can act on. */
  const sendWithWallet = useCallback(
    async (input: Record<string, unknown>) => {
      if (!accountId) throw new Error('Connect a wallet first.');
      setTriedSend(null);
      sessionStorage.setItem(TRY_KEY, String(Date.now()));
      try {
        const result = await signAndSendTransaction({
          receiverId: contractId,
          actions: [
            actionCreators.functionCall(
              'request_execution',
              {
                source: { Project: { project_id: projectId, version_key: null } },
                resource_limits: { max_instructions: 10000000000, max_memory_mb: 128, max_execution_seconds: 60 },
                input_data: JSON.stringify(input),
                response_format: 'Json',
                secrets_ref: { account_id: accountId, profile: PROFILE },
                // A priced operation is refused without it. Only the price is
                // taken at settlement; anything over comes back.
                ...(onChainCost ? { params: { attached_usd: onChainCost.price } } : {}),
              },
              BigInt('300000000000000'),
              BigInt('100000000000000000000000'),
            ),
          ],
        });
        sessionStorage.removeItem(TRY_KEY);
        return answerOf(result as { status?: { SuccessValue?: string } });
      } catch (e) {
        sessionStorage.removeItem(TRY_KEY);
        throw e;
      }
    },
    [accountId, answerOf, contractId, onChainCost, projectId, signAndSendTransaction],
  );

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
    const triedAt = Number(sessionStorage.getItem(TRY_KEY) ?? 0);
    sessionStorage.removeItem(REPLY_KEY);
    sessionStorage.removeItem(TRY_KEY);
    if (errorCode) {
      const refused = errorCode === 'userRejected';
      if (triedAt) {
        setTriedSend({ error: refused ? 'The wallet refused the transaction, so nothing was sent.' : `The wallet reported: ${errorCode}.` });
        return;
      }
      setError(refused ? 'The wallet refused the transaction, so nothing changed.' : `The wallet reported: ${errorCode}.`);
      return;
    }
    const hash = (hashes ?? '').split(',').filter(Boolean).pop();
    if (!hash) return;
    if (triedAt && Date.now() - triedAt <= REPLY_TTL_MS) {
      // A test message. Its answer is in the transaction and nowhere else, so
      // it is read here rather than by the block that asked for it.
      waitForTransactionOutcome(hash, accountId, rpcUrl)
        .then((outcome) => {
          if (!outcome) throw new Error('The transaction could not be found yet. Reload in a moment.');
          setTriedSend(answerOf(outcome as { status?: { SuccessValue?: string } }));
        })
        .catch((e) => setTriedSend({ error: e instanceof Error ? e.message : String(e) }));
      return;
    }
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
  }, [accountId, answerOf, loadRow, openAnswer, rpcUrl]);

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
          if (/public key/i.test(why)) why += ` — this wallet signed with "${shortKey(signed.publicKey)}".`;
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
      // Written, not read: certain about the policy, and silent about
      // anything the connector alone could tell us.
      if ('GMAIL_POLICY' in update.keys) {
        setPolicyRead({ origin: 'saved', present: true, sentToday: 0, unknownKeys: [] });
      }
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

      {published === false && stage === 'idle' && (
        <div className="rounded border border-gray-200 p-4 text-sm space-y-2">
          <p className="font-medium">The Gmail connector is not published on {network} yet.</p>
          <p className="text-muted-foreground">
            Connecting here would store a credential nothing can read — the project{' '}
            <code>{projectId}</code> does not exist on this network. Switch the network at the top of the page, or
            come back when it is published.
          </p>
          {row && <p className="text-muted-foreground">Your stored row is still here and is not affected.</p>}
        </div>
      )}

      {/* ---------------- a first connection ---------------- */}
      {published !== false && row === null && stage === 'idle' && !reconnectToken && (
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
          <div className="rounded border-2 border-amber-400 bg-amber-50 p-4 text-sm space-y-2">
            <p className="font-medium text-amber-900">Google has granted the credential. Nothing is saved yet.</p>
            <p className="text-amber-900">
              Choose what the agent may do, then press the button: your browser encrypts the credential and one
              transaction stores it under <strong>{accountId}</strong>, readable by you alone.
            </p>
            <More label="Who can read it, and how do I give an agent access?">
              <p>
                It is sealed to a key whose private half exists only inside the keystore enclave — not on our
                servers, and not in this page.
              </p>
              <p>
                To let an agent send mail you add its account on the <a className="underline" href="/secrets">secrets page</a>,
                with an expiry if you want the access to lapse on its own. You can take it back at any time.
              </p>
            </More>
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
          <div className="rounded border border-green-300 bg-green-50 p-4 text-sm">
            <p className="font-medium text-green-800">Gmail connected.</p>
            <p className="mt-1 text-green-900">
              {gmailPolicy.summarize(policy)} Nobody can send until you grant an agent.
            </p>
          </div>
          <a href={`/secrets?project=${encodeURIComponent(projectId)}&profile=${PROFILE}&access=1`} className="inline-block rounded bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700">
            Grant an agent access
          </a>
          <TrySending
            coordinatorUrl={coordinatorUrl}
            projectId={projectId}
            profile={PROFILE}
            accountId={accountId ?? ''}
            walletSend={sendWithWallet}
            walletOutcome={triedSend}
            walletCost={onChainCost}
            walletCostUnreadable={costUnreadable}
            stablecoin={stablecoin}
          />
          <More label="Where the credential lives, and what an agent names">
            <p>
              Row <code>{PROFILE}</code> under <code>{projectId}</code>, encrypted, readable by{' '}
              <strong>{accountId}</strong> alone until you add someone under Access. An agent you granted names{' '}
              <code>{`{ account_id: "${accountId}", profile: "${PROFILE}" }`}</code> in its calls. Removing the row
              disconnects the account.
            </p>
            {txHash && <p>Transaction {txHash}</p>}
          </More>
        </div>
      )}

      {/* ---------------- an existing connection ---------------- */}
      {published !== false && loaded && stage === 'idle' && (
        <div className="space-y-4">
          <div className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
            <span className="font-medium text-green-800">Gmail is connected.</span> Who may use it:{' '}
            <AccessChips access={loaded.access} />{' '}
            <a className="underline" href={`/secrets?project=${encodeURIComponent(projectId)}&profile=${PROFILE}&access=1`}>
              Manage access
            </a>
          </div>

          {saved && <div className="rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">✓ {saved}</div>}

          {/* Rule 4: while a signed change waits for its transaction, this block
              IS the page. The policy editor and everything else are not
              rendered — a second control on screen here is a person deciding
              they are done and closing the tab with nothing saved. */}
          {updateStage === 'ready-to-store' || updateStage === 'storing' ? (
            <div className="rounded border-2 border-amber-400 bg-amber-50 p-4 text-sm space-y-3">
              <p className="text-base font-semibold text-amber-900">Step 2 of 2 — not saved yet</p>
              <p className="text-amber-900">
                {update?.keys.GMAIL_POLICY !== undefined
                  ? 'Your signature only encrypted the new policy. It takes effect when you save it on chain.'
                  : 'Your signature only encrypted the new credential. It takes effect when you save it on chain.'}
              </p>
              <button
                onClick={storeUpdate}
                disabled={updateStage === 'storing'}
                className="rounded bg-[#cc6600] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {updateStage === 'storing' ? 'Waiting for your wallet…' : 'Save on chain'}
              </button>
              <More label="What does this transaction do?">
                {pendingSummary && (
                  <p>
                    The keystore re-sealed your row with the change merged in: {pendingSummary.total} key
                    {pendingSummary.total === 1 ? '' : 's'}
                    {pendingSummary.updated.length > 0 ? `, changed: ${pendingSummary.updated.join(', ')}` : ''}.
                  </p>
                )}
                <p>
                  One transaction stores it under the access rule it has now. The storage deposit is quoted again
                  for the new size; what the row already holds counts toward it, and the difference is returned.
                </p>
              </More>
            </div>
          ) : (
            <>
              {/* ---- the policy ---- */}
              <div className="space-y-3">
                {policyRead?.origin === 'read' && !policyRead.present && (
                  <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    The connector reports <strong>no policy at all</strong> in this row, so nothing can be sent
                    from it until one is saved.
                  </p>
                )}

                <PolicyEditor
                  key={policyRead ? 'read' : 'unread'}
                  schema={gmailPolicy}
                  value={policy}
                  onChange={setPolicy}
                  disabled={busy}
                  defaultOpen={!!policyRead}
                  headline={policyRead ? undefined : 'not loaded — what you save replaces what is stored'}
                />

                {policyRead?.origin === 'read' && policyRead.unknownKeys.length > 0 && (
                  <p className="text-xs text-amber-800">
                    The stored policy also has {policyRead.unknownKeys.join(', ')} — a key this connector does not
                    know, which makes it refuse to send. Saving from here drops it.
                  </p>
                )}

                {!policyRead && (
                  <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    You have not read the policy stored now. Saving replaces it — whatever it allows — with what is
                    in the form above.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {policyRead?.origin !== 'read' && (
                    <button
                      onClick={readPolicy}
                      disabled={busy}
                      className="rounded border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {reading ? 'Waiting for your wallet…' : 'Load current policy'}
                    </button>
                  )}
                  <button
                    onClick={() => beginUpdate({ keys: { GMAIL_POLICY: toJson(gmailPolicy, policy) }, label: 'Policy saved.' })}
                    disabled={busy || policyErrors.length > 0}
                    className={`rounded px-4 py-2 text-sm text-white disabled:opacity-50 ${
                      policyRead ? 'bg-[#cc6600]' : 'bg-red-700 hover:bg-red-800'
                    }`}
                  >
                    {updateStage === 'signing' && update?.keys.GMAIL_POLICY !== undefined
                      ? 'Waiting for your signature…'
                      : policyRead
                        ? 'Update policy'
                        : 'Yes, overwrite the stored policy'}
                  </button>
                </div>

                {!policyRead && (
                  <More label="Why does loading the policy need a transaction?">
                    <p>
                      Your policy is stored sealed, together with the credential, and only the keystore enclave can
                      open it — this page cannot read it back. The one door into the enclave is running the
                      connector, and on chain a run is a transaction: it attaches 0.1 NEAR, keeps the run&apos;s
                      cost — about 0.0013 NEAR — and returns the rest.
                    </p>
                    <p>
                      The connector answers with the policy sealed to a key this page has just created and never
                      sends anywhere, so the chain records only ciphertext.
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

              <TrySending
                coordinatorUrl={coordinatorUrl}
                projectId={projectId}
                profile={PROFILE}
                accountId={accountId ?? ''}
                walletSend={sendWithWallet}
                walletOutcome={triedSend}
                walletCost={onChainCost}
                walletCostUnreadable={costUnreadable}
                stablecoin={stablecoin}
              />

              {/* Rule 9: reconnecting is rare, so it sits last and closed —
                  unless a new credential is already in hand, when it opens
                  itself, because what is pending must never be hidden. */}
              <div className="border-t border-gray-200 pt-3 space-y-3">
                {reconnectToken ? (
                  <div className="rounded border-2 border-amber-400 bg-amber-50 p-4 text-sm space-y-2">
                    <p className="font-medium text-amber-900">Google granted a new credential. It is not in your row yet.</p>
                    <button
                      onClick={() => beginUpdate({ keys: { GMAIL_REFRESH_TOKEN: reconnectToken }, label: 'Google account reconnected.' })}
                      disabled={busy}
                      className="rounded bg-[#cc6600] px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {updateStage === 'signing' ? 'Waiting for your signature…' : 'Sign to put it in your row'}
                    </button>
                  </div>
                ) : (
                  <More label="Reconnect the Google account">
                    <p>
                      If Google has revoked the token — the agent reports <code>credential_expired</code> — or you
                      want a different mailbox. A new consent, then one signature and one transaction; the policy
                      you have stays as it is.
                    </p>
                    <button
                      onClick={() => consent('reconnect')}
                      disabled={!clientId || busy}
                      className="rounded border border-gray-300 px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
                    >
                      Reconnect Google account
                    </button>
                  </More>
                )}
                <More label="Connection details">
                  <p>
                    Row <code>{PROFILE}</code> under <code>{projectId}</code>, connected {connectedSince?.toLocaleDateString()}
                    {updatedAt && updatedAt.getTime() !== connectedSince?.getTime() ? `, last updated ${updatedAt.toLocaleDateString()}` : ''}.
                    An agent you granted names <code>{`{ account_id: "${accountId}", profile: "${PROFILE}" }`}</code> in its calls.
                  </p>
                  {policyRead?.origin === 'read' && (
                    <p>
                      {policyRead.sentToday} message{policyRead.sentToday === 1 ? '' : 's'} sent today by you — each caller has
                      its own daily counter, and your agent&apos;s is not this one.
                    </p>
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

export default function ConnectGmailPage() {
  return (
    <RequireWallet>
      <Suspense>
        <ConnectGmail />
      </Suspense>
    </RequireWallet>
  );
}
