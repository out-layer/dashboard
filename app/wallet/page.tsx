'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { saveWalletKey, getWalletKey } from '@/lib/wallet-keys';
import {
  preparePolicyWrite,
  prepareApprovedPolicy,
  storePreparedPolicy,
  preparedWriteIsFresh,
  parsePolicyResponse,
  parseApproverLine,
  tokenLimitsProblems,
  protectedAgentPolicy,
  summarizePolicy,
  withAddresses,
  addressProblem,
  addressList,
  DEFAULT_POLICY,
  approvalWithStored,
  buildAutoUpTo,
  parseAutoUpTo,
  autoUpToProblems,
  AUTO_WINDOWS,
  NATIVE_TOKEN_KEY,
  NO_AUTO_APPROVAL,
  type AutoApproval,
  type AutoWindow,
  type Approver,
  type PolicyForm,
  type PreparedPolicyWrite,
} from '@/lib/wallet-policy';
import { useApiKeyHash } from '@/hooks/useApiKeyHash';
import { usePolicyForm } from '@/hooks/usePolicyForm';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { AgentChip } from '@/components/ui/agent-chip';
import { Badge } from '@/components/ui/badge';
import { CopyText } from '@/components/ui/copy-text';
import { SkillUrlBox } from '@/components/ui/skill-url-box';
import { InfoHint } from '@/components/ui/info-hint';
import { WalletPolicyForm } from '@/components/wallet/WalletPolicyForm';
import { PolicyJsonEditor } from '@/components/wallet/PolicyJsonEditor';
import { AmountInput, policyTokensFromCatalog, type PolicyToken } from '@/components/wallet/TokenLimitsSection';

const AUTO_WINDOW_LABELS: Record<AutoWindow, string> = { hourly: 'per hour', daily: 'per day', monthly: 'per month' };

const SKILL_URL = 'https://skills.outlayer.ai/agent-custody/SKILL.md';
const FIELD =
  'w-full max-w-xl rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent';

interface WalletInfo {
  wallet_id: string;
  address: string;
  /** The customer vault the wallet's keys derive from, when it has one. */
  vault_id?: string | null;
}

/**
 * Largest approver set a policy may declare.
 *
 * Mirrors `MAX_APPROVAL_VOTES` in the keystore (`keystore-worker/src/api.rs`), which caps how
 * many votes one signing request may carry: verifying a vote costs a NEP-413 signature check, so
 * an uncapped ballot is CPU a caller can spend on our behalf. A policy with more approvers than
 * this is not merely discouraged — its threshold could never be met, because the votes would not
 * fit in the request. The on-chain contract does not enforce this, so it is checked here, where
 * the policy is written, rather than at the first signature that needs approval.
 */
const MAX_APPROVERS = 16;

/**
 * Every type the engine holds to the approval threshold. A type missing here
 * could not be excluded in the form, and an exclusion set through the API
 * would be dropped on the next save.
 */
const APPROVAL_TYPES = [
  ['transfer', 'Send NEAR'],
  ['intents_withdraw', 'Withdraw on NEAR'],
  ['intents_transfer', 'Pay inside NEAR Intents'],
  ['cross_chain_withdraw', 'Send to other chains'],
  ['call', 'Contract calls'],
  ['delete', 'Delete the wallet account'],
  ['intents_swap', 'Swaps'],
  ['limit_order', 'Limit orders'],
  ['payment_check', 'Payment links'],
] as const;
const ALL_APPROVAL_TYPES: readonly string[] = APPROVAL_TYPES.map(([type]) => type);
const DEFAULT_APPROVAL_TYPES = ALL_APPROVAL_TYPES.filter((t) => t !== 'intents_swap');

/** A storage deposit in NEAR, rounded up to four decimals. */
function depositNear(yocto: string): string {
  const unit = BigInt('100000000000000000000'); // 1e20 yocto = 0.0001 NEAR
  const tenThousandths = (BigInt(yocto) + unit - BigInt(1)) / unit;
  return (Number(tenThousandths) / 10000).toString();
}

/** Count the approvers a policy would declare: the primary one plus each non-empty extra line. */
function countApprovers(primaryOwner: string, additional: string): number {
  const extra = additional
    .split('\n')
    .filter((line) => line.split(',')[0]?.trim())
    .length;
  return (primaryOwner ? 1 : 0) + extra;
}

/** What `/wallet/new` left for this page about a sponsor code it redeemed. */
function takeSponsorNote(address: string): { ok: boolean; text: string } | null {
  if (typeof window === 'undefined') return null;
  const key = `outlayer:sponsorship:${address}`;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const note = JSON.parse(raw);
    return typeof note?.text === 'string' ? { ok: Boolean(note.ok), text: note.text } : null;
  } catch {
    return null;
  }
}

export default function AgentPolicyPage() {
  return (
    <Suspense fallback={null}>
      <AgentPolicyGate />
    </Suspense>
  );
}

const HEADER = {
  title: 'Agent policy',
  description: 'What the agent’s key may do with the wallet’s money. You own the policy; the enclave that holds the keys enforces it.',
};

function AgentPolicyGate() {
  const searchParams = useSearchParams();
  const { isConnected } = useNearWallet();
  const walletParam = searchParams.get('wallet');
  // `?key=` as given, or, for `?wallet=<account>`, the key this browser saved
  // for that wallet — a link can name a wallet without carrying its key.
  const apiKey = searchParams.get('key') || (walletParam ? getWalletKey(`ed25519:${walletParam}`) : null);

  if (!apiKey) {
    return (
      <div className="w-full">
        <PageHeader {...HEADER} />
        <div className="max-w-3xl rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          {walletParam ? (
            <p>
              This browser holds no key for <AgentChip account={walletParam} className="font-mono" />. Open this link in
              the browser where the agent was created, or add the wallet&apos;s key on{' '}
              <Link href="/wallet/manage" className="text-accent-text hover:underline">Wallets</Link>.
            </p>
          ) : (
            <p>
              A policy belongs to one agent wallet.{' '}
              <Link href="/wallet/new" className="text-accent-text hover:underline">Create an agent</Link>, pick one on{' '}
              <Link href="/wallet/manage" className="text-accent-text hover:underline">Wallets</Link>, or open the link your
              agent gave you.
            </p>
          )}
        </div>
      </div>
    );
  }
  if (!isConnected) {
    return (
      <div className="w-full">
        <PageHeader {...HEADER} />
        <div className="mb-4 max-w-3xl rounded-lg border border-border bg-card p-4 text-sm">
          <p className="text-foreground">
            {walletParam ? (
              <>The agent wallet <AgentChip account={walletParam} className="font-mono" /> is ready.</>
            ) : (
              <>The agent wallet is ready.</>
            )}{' '}
            Next, connect the NEAR account that owns it — or will own it. You then choose who the agent may pay and how
            much, and store that with one transaction: a small storage deposit in NEAR, returned if you remove the policy.
          </p>
          <details className="mt-2 text-muted-foreground">
            <summary className="text-accent-text">I have no NEAR account</summary>
            <p className="mt-2">
              A policy needs a NEAR account to own it; any NEAR wallet creates one in a minute. Without a policy the
              agent wallet still works, but whoever holds its key moves everything in it, with no limits. If you accept
              that for now, this is the key — keep the wallet empty until a policy is stored:
            </p>
            <div className="mt-2 rounded-md border border-border px-3 py-2 font-mono text-sm break-all text-foreground">
              <CopyText value={apiKey} />
            </div>
          </details>
        </div>
        <RequireWallet subject="this agent's policy" />
      </div>
    );
  }
  return <AgentPolicy apiKey={apiKey} />;
}

type AddRequest = {
  /** Addresses the link asked for that went onto the list. */
  added: string[];
  /** Asked for, already on the list. */
  present: string[];
  /** Asked for, not addresses. */
  invalid: string[];
  mode: PolicyForm['address_mode'];
};

function AgentPolicy({ apiKey }: { apiKey: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { accountId, isConnected, network, contractId, viewMethod, signAndSendTransaction } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);
  const requestedAddresses = useMemo(
    () => searchParams.getAll('add_address').flatMap((v) => v.split(',')).map((a) => a.trim()).filter(Boolean),
    [searchParams],
  );

  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sponsorNote, setSponsorNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [existingPolicy, setExistingPolicy] = useState<boolean | null>(null);
  /** The policy on chain could not be read back: storing the form would replace it unseen. */
  const [policyUnread, setPolicyUnread] = useState(false);
  /** The policy is on chain as of this visit's own transaction. */
  const [stored, setStored] = useState(false);
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null);
  /** How a wallet with no policy starts: the protected form, or an open one. */
  const [start, setStart] = useState<'protected' | 'custom'>('protected');

  // The owner is the account that sends `store_wallet_policy`: the contract
  // takes it from the transaction, so it is the connected wallet and nothing
  // a field could name.
  const owner = accountId ?? '';

  const [tokens, setTokens] = useState<PolicyToken[] | null>(null);
  /**
   * A write ready for the owner's transaction, and the policy text it was
   * made from: it is good only for that text.
   */
  const [prepared, setPrepared] = useState<{ jsonText: string; caller: string; write: PreparedPolicyWrite } | null>(null);
  const [preparing, setPreparing] = useState(false);
  /** Why the last attempt failed, and the policy text it was for: an edit makes it worth repeating. */
  const [prepareFailure, setPrepareFailure] = useState<{ jsonText: string; message: string } | null>(null);
  /** Counts prepare runs, so an answer for an older text is dropped. */
  const prepareRun = useRef(0);

  const apiKeyHash = useApiKeyHash(apiKey);
  const knownKeyHashes = useMemo(
    () => (apiKeyHash ? new Map([[apiKeyHash, 'the key this browser holds']]) : new Map<string, string>()),
    [apiKeyHash],
  );
  /**
   * A key the owner asked this browser to use from now on. It replaces the
   * stored one only after the policy naming it is on chain: before that it
   * opens nothing, and this page would lock itself out.
   */
  const [nextBrowserKey, setNextBrowserKey] = useState<string | null>(null);

  // Approval
  const [requireApproval, setRequireApproval] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState('1');
  const [additionalApprovers, setAdditionalApprovers] = useState('');
  /**
   * `approval.locked`: the policy is changed only with the approvers' quorum.
   * The owner alone can set it; clearing it is a write like any other and
   * waits for the votes.
   */
  const [lockPolicy, setLockPolicy] = useState(false);
  /** A write the current policy's approvers have to release before it goes on chain. */
  const [pendingWrite, setPendingWrite] = useState<{ approvalId: string; requestId: string; requiredApprovals: number } | null>(null);
  const [pickingUp, setPickingUp] = useState(false);
  /** The approvers' released write, read and priced: one click from the chain. */
  const [approvedPrepared, setApprovedPrepared] = useState<PreparedPolicyWrite | null>(null);
  /** The key the stored policy pins the owner's own vote to, kept across a save. */
  const [ownerPubkey, setOwnerPubkey] = useState<string | undefined>(undefined);
  const [approvalTypes, setApprovalTypes] = useState<Set<string>>(new Set(DEFAULT_APPROVAL_TYPES));
  /** Exclusions the stored policy carries for types this form has no checkbox for: kept as stored. */
  const [otherExcluded, setOtherExcluded] = useState<string[]>([]);
  /** `approval.auto_up_to`: what leaves in a window without asking. */
  const [auto, setAuto] = useState<AutoApproval>(NO_AUTO_APPROVAL);
  /** A stored threshold over several windows: the form has one, so it is kept as stored and not edited. */
  const [autoSeveral, setAutoSeveral] = useState<Record<string, unknown> | null>(null);
  /** Capabilities stored as allowed that the stored type rule refuses: shown off, and said so. */
  const [inertCapabilities, setInertCapabilities] = useState<string[]>([]);

  /** The policy on chain as it was read: what the form has no field for is kept from it. */
  const [storedPolicy, setStoredPolicy] = useState<Record<string, unknown> | null>(null);

  const {
    policyForm,
    setPolicyForm,
    policyJsonText,
    setPolicyJsonText,
    jsonEdited,
    setJsonEdited,
    resetJson,
  } = usePolicyForm({
    apiKeyHash,
    storedPolicy,
    augmentPolicy: useCallback((base: Record<string, unknown>) => {
      if (!requireApproval) return base;
      const approvers: Approver[] = [
        ownerPubkey ? { id: owner, role: 'admin', pubkey: ownerPubkey } : { id: owner, role: 'admin' },
      ];
      for (const line of additionalApprovers.split('\n')) {
        const approver = parseApproverLine(line);
        if (approver) approvers.push(approver);
      }
      const excluded_types = [...ALL_APPROVAL_TYPES.filter((t) => !approvalTypes.has(t)), ...otherExcluded];
      const auto_up_to = autoSeveral ?? buildAutoUpTo(auto);
      return {
        ...base,
        approval: approvalWithStored(
          {
            threshold: { required: parseInt(approvalRequired, 10) || 1 },
            ...(excluded_types.length > 0 ? { excluded_types } : {}),
            approvers,
            ...(lockPolicy ? { locked: true } : {}),
            ...(auto_up_to ? { auto_up_to } : {}),
          },
          storedPolicy?.approval,
        ),
      };
    }, [requireApproval, approvalRequired, additionalApprovers, owner, ownerPubkey, approvalTypes, otherExcluded, lockPolicy, storedPolicy, auto, autoSeveral]),
  });

  /** The form a wallet with no policy opens with. */
  const startingForm = useCallback(
    (kind: 'protected' | 'custom', address: string, catalog: PolicyToken[] | null): PolicyForm => {
      if (kind === 'custom') return DEFAULT_POLICY;
      const usdc = (catalog ?? []).find((t) => t.symbol === 'USDC' && t.chain.split(', ').includes('near'));
      return protectedAgentPolicy({ ownerAccount: owner, walletAccount: address, tokens: usdc ? [usdc.key] : [] });
    },
    [owner],
  );

  /** Put the addresses the link asked for on the form's list, and say what happened to each. */
  const applyRequested = useCallback((form: PolicyForm): PolicyForm => {
    if (requestedAddresses.length === 0) return form;
    const valid = requestedAddresses.filter((a) => !addressProblem(a));
    const result = withAddresses(form, valid);
    setAddRequest({
      added: result.added,
      present: valid.filter((a) => !result.added.includes(a)),
      invalid: requestedAddresses.filter((a) => addressProblem(a)),
      mode: result.mode,
    });
    return result.form;
  }, [requestedAddresses]);

  // One read of everything the page stands on: the wallet, its token catalog,
  // whether a policy is on chain, and that policy.
  useEffect(() => {
    // The stored policy is read against this key's hash (the form names the
    // key apart from the others), so the read waits for it.
    if (!apiKeyHash) return;
    let cancelled = false;
    (async () => {
      try {
        const headers = { Authorization: `Bearer ${apiKey}` };
        const [addressResp, tokensResp] = await Promise.all([
          fetch(`${coordinatorUrl}/wallet/v1/address?chain=near`, { headers }),
          fetch(`${coordinatorUrl}/wallet/v1/tokens`, { headers }).catch(() => null),
        ]);
        if (!addressResp.ok) {
          const data = await addressResp.json().catch(() => ({}));
          throw new Error(data.message || `The wallet could not be read (HTTP ${addressResp.status})`);
        }
        const data = await addressResp.json();
        const info: WalletInfo = { wallet_id: data.wallet_id, address: data.address, vault_id: data.vault_id ?? null };
        const catalog = tokensResp && tokensResp.ok ? policyTokensFromCatalog(await tokensResp.json().catch(() => null)) : null;

        const onChain = await viewMethod({
          contractId,
          method: 'get_wallet_policy',
          args: { wallet_pubkey: `ed25519:${info.address}` },
        }).catch(() => null);
        if (cancelled) return;

        setWalletInfo(info);
        setTokens(catalog);
        setSponsorNote(takeSponsorNote(info.address));

        if (onChain === null) {
          setExistingPolicy(false);
          setPolicyForm(applyRequested(startingForm('protected', info.address, catalog)));
        } else {
          setExistingPolicy(true);
          const resp = await fetch(`${coordinatorUrl}/wallet/v1/policy`, { headers });
          if (cancelled) return;
          if (!resp.ok) {
            setPolicyUnread(true);
          } else {
            const policy = await resp.json();
            const parsed = parsePolicyResponse(policy, apiKeyHash);
            if (cancelled) return;
            setStoredPolicy(policy);
            setPolicyForm(applyRequested(parsed.form));
            setInertCapabilities(parsed.inertCapabilities);
            setRequireApproval(Boolean(parsed.approval));
            if (parsed.approval) {
              setApprovalRequired(parsed.approval.required);
              // The owner is the primary approver, written by the form itself:
              // its line leaves the textarea, and its pinned key (if any) is kept.
              const lines = parsed.approval.approvers.split('\n');
              setOwnerPubkey(lines.map(parseApproverLine).find((a) => a?.id === owner)?.pubkey);
              setAdditionalApprovers(lines.filter((line) => parseApproverLine(line)?.id !== owner).join('\n'));
              const excluded = (policy.approval?.excluded_types || []) as string[];
              setApprovalTypes(new Set(ALL_APPROVAL_TYPES.filter((t) => !excluded.includes(t))));
              setOtherExcluded(excluded.filter((t) => !ALL_APPROVAL_TYPES.includes(t)));
              setLockPolicy(Boolean(policy.approval?.locked));
              const storedAuto = parseAutoUpTo(policy.approval?.auto_up_to);
              setAuto(storedAuto.auto);
              setAutoSeveral(storedAuto.several);
            }
          }
        }

        // A handoff link carries the key in its query. Once this browser holds
        // it, the address bar names the wallet instead.
        if (searchParams.get('key')) {
          const pubkey = `ed25519:${info.address}`;
          const saved = getWalletKey(pubkey);
          if (!saved) saveWalletKey(pubkey, apiKey, 'handoff link');
          if (!saved || saved === apiKey) {
            const next = new URLSearchParams(searchParams.toString());
            next.delete('key');
            next.set('wallet', info.address);
            router.replace(`/wallet?${next.toString()}`);
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Read once per wallet key, account and network: the form is the owner's
    // to edit after that, and nothing here may overwrite it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, apiKeyHash, coordinatorUrl, contractId, owner]);

  const tokenLabel = useCallback(
    (key: string) => {
      const token = (tokens ?? []).find((t) => t.key === key);
      return token ? { symbol: token.symbol, decimals: token.decimals } : null;
    },
    [tokens],
  );
  const summary = useMemo(
    () => summarizePolicy(policyForm, { approval: requireApproval, tokenLabel, auto: autoSeveral ? null : auto, autoKept: Boolean(autoSeveral) }),
    [policyForm, requireApproval, tokenLabel, auto, autoSeveral],
  );

  /** Why the form cannot be stored as it stands, or `null`. */
  const policyProblem: string | null = (() => {
    if (policyUnread) {
      return 'The policy on chain could not be read, so this form does not show it. Reload the page before changing anything: storing now would replace it.';
    }
    // The keystore refuses a signing request carrying more than MAX_APPROVERS
    // votes, so a larger set could never reach its threshold.
    if (requireApproval && countApprovers(owner, additionalApprovers) > MAX_APPROVERS) {
      return (
        `Too many approvers: ${countApprovers(owner, additionalApprovers)} (limit ${MAX_APPROVERS}, including you). ` +
        `A signing request cannot carry more votes than that, so a larger set could never reach its threshold.`
      );
    }
    if (!jsonEdited) {
      if (requireApproval && !autoSeveral) {
        const autoProblems = autoUpToProblems(auto);
        if (autoProblems.length > 0) return autoProblems.join(' ');
      }
      if (policyForm.ask_unlisted && policyForm.address_mode === 'whitelist' && !requireApproval) {
        return 'Asking about a new address needs the second factor on: there is nobody to ask.';
      }
      const limitProblems = tokenLimitsProblems(policyForm.token_limits);
      if (limitProblems.length > 0) return limitProblems.join(' ');
      if (policyForm.address_mode === 'whitelist' && addressList(policyForm).length === 0) {
        return 'The address list is empty: the wallet could pay no one, you included.';
      }
    }
    return null;
  })();

  /** The prepared write, when it is for the policy text on screen and still good to send. */
  const ready =
    prepared && prepared.jsonText === policyJsonText && prepared.caller === accountId && preparedWriteIsFresh(prepared.write)
      ? prepared.write
      : null;
  const prepareError = prepareFailure && prepareFailure.jsonText === policyJsonText ? prepareFailure.message : null;
  const prepareFailed = prepareError !== null;

  /** Encrypt, sign and price the policy on screen. Opens no wallet. */
  const runPrepare = useCallback(async (jsonText: string) => {
    if (!walletInfo || !accountId) return;
    const run = ++prepareRun.current;
    setPreparing(true);
    setPrepareFailure(null);
    try {
      const result = await preparePolicyWrite({
        coordinatorUrl,
        apiKey,
        walletId: walletInfo.wallet_id,
        policyJsonText: jsonText,
        contractId,
        // The connected wallet sends the transaction, so it is the account the
        // signature must name.
        callerAccountId: accountId,
        viewMethod,
      });
      if (run !== prepareRun.current) return;
      if (result.pending) {
        // The policy on chain is locked: its approvers decide. Nothing is sent.
        setPendingWrite(result);
        setApprovedPrepared(null);
      } else {
        setPrepared({ jsonText, caller: accountId, write: result.prepared });
      }
    } catch (err) {
      if (run === prepareRun.current) setPrepareFailure({ jsonText, message: (err as Error).message });
    } finally {
      if (run === prepareRun.current) setPreparing(false);
    }
  }, [walletInfo, apiKey, accountId, coordinatorUrl, contractId, viewMethod]);

  // A wallet with NO policy on chain is prepared as the form is filled, so the
  // button that opens the wallet has nothing to wait for. Only then: replacing
  // a locked policy files a request with its approvers, which is not something
  // to do on a keystroke — a wallet that has a policy is prepared on a click.
  useEffect(() => {
    if (existingPolicy !== false || stored || !isConnected || !walletInfo || !policyJsonText || !apiKeyHash) return;
    if (policyProblem || pendingWrite || ready || prepareFailed || submitting) return;
    const timer = setTimeout(() => runPrepare(policyJsonText), 900);
    return () => clearTimeout(timer);
  }, [existingPolicy, stored, isConnected, walletInfo, policyJsonText, apiKeyHash, policyProblem, pendingWrite, ready, prepareFailed, submitting, runPrepare]);

  /** The one place the wallet opens: a click on a button that names the transaction. */
  const handleStore = async (write: PreparedPolicyWrite) => {
    if (!walletInfo) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await storePreparedPolicy({
        coordinatorUrl,
        walletId: walletInfo.wallet_id,
        contractId,
        prepared: write,
        signAndSendTransaction,
      });
      // Kept in this browser, for this page and the approvals.
      saveWalletKey(write.write.walletPubkey, nextBrowserKey ?? apiKey);
      const onChain = await viewMethod({
        contractId,
        method: 'get_wallet_policy',
        args: { wallet_pubkey: write.write.walletPubkey },
      }).catch(() => null);
      setPrepared(null);
      setApprovedPrepared(null);
      setPendingWrite(null);
      if (onChain === null) {
        setNotice('The transaction was sent, but the policy is not readable on chain yet. Reload this page in a moment: the wallet is protected only once the policy shows here.');
      } else {
        setExistingPolicy(true);
        setStored(true);
        window.scrollTo({ top: 0 });
      }
    } catch (err) {
      // A refused wallet leaves the prepared write where it was.
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  /** The approvers voted: read the signed change off the request. Opens no wallet. */
  const handleCheckVotes = async () => {
    if (!pendingWrite || !walletInfo) return;
    setError(null);
    setNotice(null);
    setPickingUp(true);
    try {
      const outcome = await prepareApprovedPolicy({
        coordinatorUrl,
        apiKey,
        requestId: pendingWrite.requestId,
        contractId,
        viewMethod,
      });
      if (outcome.status === 'pending_approval') {
        setNotice(`Still waiting for the approvers (approval ${pendingWrite.approvalId}).`);
      } else if (outcome.status === 'failed') {
        setPendingWrite(null);
        setError(`The approvers' votes did not release this change: ${outcome.error}. Prepare the change again.`);
      } else {
        setApprovedPrepared(outcome.prepared);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPickingUp(false);
    }
  };

  const chooseStart = (kind: 'protected' | 'custom') => {
    if (!walletInfo || kind === start) return;
    setStart(kind);
    setJsonEdited(false);
    setPolicyForm(applyRequested(startingForm(kind, walletInfo.address, tokens)));
  };

  if (loading) {
    return (
      <div className="w-full">
        <PageHeader {...HEADER} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-b-2 border-accent" />
          Reading the wallet and its policy…
        </div>
      </div>
    );
  }
  if (!walletInfo) {
    return (
      <div className="w-full">
        <PageHeader {...HEADER} />
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive-text">{error ?? 'The wallet could not be read.'}</p>
        </div>
      </div>
    );
  }

  const statusBadge = existingPolicy ? (
    <Badge variant="success">Protected: policy on chain</Badge>
  ) : (
    <Badge variant="warning">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="mr-1 h-3 w-3"><path d="M8 1.5 15 14H1zM7.25 6v4h1.5V6zm0 5v1.5h1.5V11z" /></svg>
      No policy: this key is unrestricted
    </Badge>
  );

  if (stored) {
    return (
      <div className="w-full">
        <PageHeader {...HEADER} badge={statusBadge} />
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-foreground">The policy is on chain</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <AgentChip account={walletInfo.address} className="font-mono" /> now signs only what the policy permits.
              You, <span className="font-mono">{owner}</span>, are its owner.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-foreground">
              {summary.can.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {summary.cautions.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {summary.cautions.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <Link href={`/wallet/fund?to=${encodeURIComponent(walletInfo.address)}`} className="text-accent-text hover:underline">
                Fund the wallet
              </Link>
              <button type="button" onClick={() => setStored(false)} className="text-accent-text hover:underline">
                Change the policy
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-foreground">Give the key to the agent</h2>
            <div className="mt-2 rounded-md border border-border px-3 py-2 font-mono text-sm break-all">
              <CopyText value={nextBrowserKey ?? apiKey} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              The service keeps only the key&apos;s hash; this browser keeps a copy for this page. If the key leaks it
              can do what the policy permits and nothing else, and you can replace it here under &quot;Which keys run
              the wallet?&quot;.
            </p>
            <HandOff />
          </section>
        </div>
      </div>
    );
  }

  // The engine that reads `approval.auto_up_to` and `addresses.unlisted` runs
  // on testnet only; mainnet's would ignore both. Shown where they are read.
  const approvalRulesLive = network === 'testnet';

  const approval = (
    <div>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={requireApproval}
          onChange={(e) => {
            setRequireApproval(e.target.checked);
            // Nobody to ask: the switch that asks goes off with the approvers.
            if (!e.target.checked && policyForm.ask_unlisted) setPolicyForm({ ...policyForm, ask_unlisted: false });
          }}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>
          Ask for my approval: a second factor
          <span className="block text-xs text-muted-foreground">
            {requireApproval
              ? 'Each ticked operation waits until you approve it with your NEAR account on the Approvals page.'
              : 'Off: the agent acts at once, inside this policy. On: the operations you tick wait for your signature.'}
          </span>
        </span>
      </label>
      {requireApproval && (
        <div className="mt-3 space-y-3 pl-6">
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {APPROVAL_TYPES.map(([type, label]) => (
              <label key={type} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={approvalTypes.has(type)}
                  onChange={() =>
                    setApprovalTypes((prev) => {
                      const next = new Set(prev);
                      if (next.has(type)) next.delete(type);
                      else next.add(type);
                      return next;
                    })
                  }
                  className="h-4 w-4 accent-accent"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-faint-foreground">
            An unticked operation runs without asking. Confidential flows wait whenever approvals are on.
          </p>

          {approvalRulesLive && (
          <div>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground">
              Without asking me, up to
              <InfoHint text="The total the agent may pay in the period before it starts asking. Everything the wallet spent in the period counts, payments you approved included, so after a large approved payment the rest of the period asks. A day is the UTC day, a month the calendar month. It covers transfers and withdrawals on NEAR. A token left empty always asks, and so do swaps, limit orders, payment links, sends to another chain, contract calls and deleting the account, unless you untick them above. The limits in “How much?” still hold: above a limit is a refusal, approved or not." />
            </p>
            {autoSeveral ? (
              <p className="mt-1 text-xs text-muted-foreground">
                This policy sets the amount for several periods at once, which this form does not edit. It is kept as
                stored; change it in the policy JSON below.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {[
                  { key: NATIVE_TOKEN_KEY, symbol: 'NEAR', decimals: 24 as number | null },
                  ...[...new Set([...policyForm.token_limits.map((row) => row.token.trim()), ...Object.keys(auto.amounts)])]
                    .filter((token) => token && token !== '*' && token !== NATIVE_TOKEN_KEY)
                    .map((token) => {
                      const label = tokenLabel(token);
                      return { key: token, symbol: label ? label.symbol : token, decimals: label ? label.decimals : null };
                    }),
                ].map((token) => (
                  <div key={token.key} className="flex max-w-xl items-start gap-2">
                    <div className="w-40 shrink-0">
                      <AmountInput
                        units={auto.amounts[token.key] ?? ''}
                        decimals={token.decimals ?? 0}
                        label={`${token.symbol}: without asking, up to`}
                        placeholder="always ask"
                        onChange={(units) => setAuto((prev) => ({ ...prev, amounts: { ...prev.amounts, [token.key]: units } }))}
                      />
                    </div>
                    <span className="min-w-0 break-all pt-2 text-sm text-muted-foreground">
                      {token.symbol}
                      {token.decimals === null ? ' (minimal units)' : ''}
                    </span>
                  </div>
                ))}
                <select
                  value={auto.window}
                  aria-label="Period the amount is counted over"
                  onChange={(e) => setAuto((prev) => ({ ...prev, window: e.target.value as AutoWindow }))}
                  className="rounded-md border border-border-strong bg-card px-3 py-2 text-sm text-foreground"
                >
                  {AUTO_WINDOWS.map((w) => (
                    <option key={w} value={w}>{AUTO_WINDOW_LABELS[w]}</option>
                  ))}
                </select>
                <p className="text-xs text-faint-foreground">
                  A token gets a row here once it has a limit row in “How much?”.
                </p>
              </div>
            )}
          </div>
          )}

          {approvalRulesLive && policyForm.address_mode === 'whitelist' && (
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={policyForm.ask_unlisted}
                onChange={(e) => setPolicyForm({ ...policyForm, ask_unlisted: e.target.checked })}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>
                <span className="flex flex-wrap items-center gap-1.5">
                  Ask me about a new address
                  <InfoHint text="Asked about, when the address is not on the list: a NEAR transfer, a withdrawal, a transfer inside NEAR Intents, a withdrawal to another chain. Always refused for such an address, asking or not: a contract call, deleting the account, a limit order, a storage deposit, a confidential operation. An approval pays the address once and does not put it on the list." />
                </span>
                <span className="block text-xs text-muted-foreground">
                  {policyForm.ask_unlisted
                    ? 'A transfer or a withdrawal to an address that is not on the list waits for your approval, however small. The limits still refuse above them, and everything else aimed at such an address is still refused.'
                    : 'Off: every operation aimed at an address that is not on the list is refused.'}
                </span>
              </span>
            </label>
          )}
          <details>
            <summary className="text-xs text-accent-text">More approvers, threshold, lock</summary>
            <div className="mt-2 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Approvals required</label>
                <input
                  type="number"
                  min="1"
                  value={approvalRequired}
                  onChange={(e) => setApprovalRequired(e.target.value)}
                  className={`${FIELD} max-w-[8rem]`}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  Other approvers, one per line: account[, pinned key]
                  <InfoHint text="You are always the first approver. Every approver's vote counts the same, and under a lock each of them votes on changes to this policy too. A value starting with ed25519: pins the approver to one key; without it any full-access key of the account votes. A word after the account (admin, signer) is a label kept with the policy; it changes nothing." />
                </label>
                <textarea
                  value={additionalApprovers}
                  onChange={(e) => setAdditionalApprovers(e.target.value)}
                  placeholder={'alice.near\nbob.near, ed25519:…'}
                  rows={3}
                  spellCheck={false}
                  className={`${FIELD} font-mono`}
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={lockPolicy}
                  onChange={(e) => setLockPolicy(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  Lock: changes need the approvers&apos; quorum
                  <span className="block text-xs text-muted-foreground">
                    Every later change to this policy, unlocking and removing it included, waits for{' '}
                    {approvalRequired || '1'} of the approvers. You can set this alone; you cannot undo it alone.
                    Freezing the wallet stays yours.
                  </span>
                </span>
              </label>
            </div>
          </details>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full">
      <PageHeader {...HEADER} badge={statusBadge} />

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md border border-info/30 bg-info/10 p-3">
          <p className="text-sm text-info">{notice}</p>
        </div>
      )}
      {sponsorNote && (
        <div className={`mb-4 rounded-md border p-3 ${sponsorNote.ok ? 'border-success/30 bg-success/10' : 'border-destructive/30 bg-destructive/10'}`}>
          <p className={`text-sm ${sponsorNote.ok ? 'text-success-text' : 'text-destructive-text'}`}>{sponsorNote.text}</p>
        </div>
      )}

      {inertCapabilities.length > 0 && (
        <div className="mb-4 rounded-md border border-info/30 bg-info/10 p-3 text-sm text-foreground">
          The stored policy allows <span className="font-mono">{inertCapabilities.join(', ')}</span> but its list of
          permitted operations leaves {inertCapabilities.length === 1 ? 'it' : 'them'} out, so the wallet has been
          refusing {inertCapabilities.length === 1 ? 'it' : 'them'}. {inertCapabilities.length === 1 ? 'It is' : 'They are'} shown
          off below; switch {inertCapabilities.length === 1 ? 'it' : 'them'} on to make {inertCapabilities.length === 1 ? 'it' : 'them'} work.
        </div>
      )}

      {addRequest && (
        <div className="mb-4 rounded-md border border-info/30 bg-info/10 p-3 text-sm text-foreground">
          {addRequest.added.length > 0 && (
            <p>
              Your agent asks to pay {addRequest.added.length === 1 ? 'a new address' : 'new addresses'}:{' '}
              <span className="break-all font-mono">{addRequest.added.join(', ')}</span>. {addRequest.added.length === 1 ? 'It is' : 'They are'} on
              the list below, not yet on chain: check {addRequest.added.length === 1 ? 'it' : 'them'} against what you expect
              to pay, then store the policy.
            </p>
          )}
          {addRequest.present.length > 0 && addRequest.mode === 'whitelist' && (
            <p><span className="break-all font-mono">{addRequest.present.join(', ')}</span>: already on the list.</p>
          )}
          {addRequest.mode === 'none' && (
            <p>This policy has no address list: the wallet already pays any address, <span className="break-all font-mono">{requestedAddresses.join(', ')}</span> included.</p>
          )}
          {addRequest.mode === 'blacklist' && (
            <p>This policy blocks the addresses on its list and pays every other. Nothing was added; remove an address from the list to unblock it.</p>
          )}
          {addRequest.invalid.length > 0 && (
            <p className="text-destructive-text">Not addresses, left out: <span className="break-all font-mono">{addRequest.invalid.join(', ')}</span></p>
          )}
        </div>
      )}

      {pendingWrite && (
        <div className="mb-4 rounded-md border border-accent/50 bg-card p-4">
          <p className="mb-2 text-sm text-foreground">
            The policy on chain is locked: this change (approval{' '}
            <code className="rounded bg-card-muted px-1">{pendingWrite.approvalId}</code>) needs{' '}
            {pendingWrite.requiredApprovals} vote(s) of its approvers, given on the{' '}
            <Link href="/wallet/approvals" className="text-accent-text underline">Approvals</Link> page. Once they have
            voted, one transaction from your wallet stores the new policy under your account, replacing the current one.
          </p>
          {approvedPrepared ? (
            <button
              type="button"
              onClick={() => handleStore(approvedPrepared)}
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? 'Waiting for your wallet…' : `Sign: store the approved policy (${depositNear(approvedPrepared.depositYocto)} NEAR deposit)`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCheckVotes}
              disabled={pickingUp}
              className="rounded-lg border border-border-strong px-4 py-2 text-sm text-foreground hover:border-accent hover:text-accent-text disabled:opacity-50"
            >
              {pickingUp ? 'Checking the votes…' : 'Check the votes'}
            </button>
          )}
        </div>
      )}

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className="text-muted-foreground">
          Agent wallet <AgentChip account={walletInfo.address} className="font-mono" />
        </span>
        <span className="text-muted-foreground">
          Owner <span className="font-mono text-foreground">{owner}</span>
        </span>
        <span className="text-muted-foreground">
          Network <span className="text-foreground">{network}</span>
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          Keys
          <span className="text-foreground">{walletInfo.vault_id ? `vault ${walletInfo.vault_id}` : 'OutLayer vault'}</span>
          <InfoHint
            text={
              walletInfo.vault_id
                ? 'The wallet’s keys derive from your own vault: recoverable through cessation or unilateral exit.'
                : 'The wallet’s keys derive from OutLayer’s master secret inside the enclave, and this wallet has no exit. A wallet owned by your NEAR account (Owner exit) or under a vault of your own can be taken out with its keys, with or without OutLayer.'
            }
          />
        </span>
      </div>

      {existingPolicy === false && (
        <>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Start from</p>
        <div className="mb-6 grid max-w-3xl gap-3 sm:grid-cols-2">
          {([
            ['protected', 'Basic protection', 'The form below is filled in for you: the agent pays only you and the addresses you add. Change anything you like.'],
            ['custom', 'Custom', 'The form below starts empty: nothing is restricted until you add the rules yourself.'],
          ] as const).map(([kind, title, about]) => (
            <button
              key={kind}
              type="button"
              aria-pressed={start === kind}
              onClick={() => chooseStart(kind)}
              className={`rounded-lg border p-3 text-left ${start === kind ? 'border-accent bg-card' : 'border-border bg-card hover:border-border-strong'}`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span className={`h-3 w-3 rounded-full border ${start === kind ? 'border-accent bg-accent' : 'border-border-strong'}`} />
                {title}
                {kind === 'protected' && <span className="text-xs font-normal text-muted-foreground">recommended</span>}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{about}</span>
            </button>
          ))}
        </div>
        </>
      )}

        <WalletPolicyForm
          policyForm={policyForm}
          onChange={setPolicyForm}
          ownerAccount={owner}
          walletAccount={walletInfo.address}
          tokens={tokens}
          apiKeyHash={apiKeyHash}
          knownKeyHashes={knownKeyHashes}
          onSaveKey={setNextBrowserKey}
          approval={approval}
          jsonEditor={
            <PolicyJsonEditor
              policyJsonText={policyJsonText}
              onChangeText={(text) => { setPolicyJsonText(text); setJsonEdited(true); }}
              jsonEdited={jsonEdited}
              onReset={resetJson}
            />
          }
        />
        </div>

        <aside className="rounded-lg border border-border bg-card p-4 xl:sticky xl:top-[4.5rem] xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto">
          <h2 className="text-sm font-semibold text-foreground">With this policy, the key</h2>
          {jsonEdited ? (
            <p className="mt-2 text-xs text-muted-foreground">
              The JSON was edited by hand, so this summary no longer describes what will be stored. Reset it from the form
              under &quot;Policy as JSON&quot; to see it again.
            </p>
          ) : (
            <>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Can</p>
              <ul className="mt-1 space-y-1 text-sm text-foreground">
                {summary.can.length > 0 ? summary.can.map((line) => <li key={line}>{line}</li>) : <li className="text-muted-foreground">Nothing.</li>}
              </ul>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">Cannot</p>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {summary.cannot.map((line) => <li key={line}>{line}</li>)}
              </ul>
              {summary.cautions.length > 0 && (
                <>
                  <p className="mt-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-warning">
                    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="h-3 w-3"><path d="M8 1.5 15 14H1zM7.25 6v4h1.5V6zm0 5v1.5h1.5V11z" /></svg>
                    Worth a second look
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-foreground">
                    {summary.cautions.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </>
              )}
            </>
          )}

          <div className="mt-4 border-t border-border pt-4">
            {(policyProblem || prepareError) && (
              <p className="mb-3 text-sm text-destructive-text">{policyProblem || prepareError}</p>
            )}
            {ready ? (
              <button
                type="button"
                onClick={() => handleStore(ready)}
                disabled={submitting}
                className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? 'Waiting for your wallet…' : `Sign: store the policy (${depositNear(ready.depositYocto)} NEAR deposit)`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => runPrepare(policyJsonText)}
                disabled={preparing || !!policyProblem || !!pendingWrite}
                className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {preparing ? 'Preparing…' : existingPolicy ? 'Prepare the policy change' : 'Prepare the policy'}
              </button>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              One transaction from <span className="font-mono">{owner}</span> stores this policy for the wallet
              {existingPolicy ? ', replacing the current one' : ''}. Nothing opens your wallet before you press the
              button.
            </p>
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="text-accent-text">What this transaction does</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  Stores the policy, encrypted to the keystore enclave, in <span className="font-mono">{contractId}</span>{' '}
                  under the wallet&apos;s key <span className="break-all font-mono">ed25519:{walletInfo.address}</span>.
                </li>
                <li>
                  Makes <span className="font-mono">{owner}</span> the owner: the account that can change or remove the
                  policy and freeze the wallet{lockPolicy && requireApproval ? ' — changes and removal wait for the approvers’ quorum' : ''}.
                </li>
                <li>
                  The stored text is ciphertext anyone can see and only the enclave can open. A holder of one of the
                  wallet&apos;s API keys reads the policy through the API.
                </li>
                <li>The storage deposit is returned when the policy is removed.</li>
                <li>
                  To undo: store another policy here, or remove it on{' '}
                  <Link href="/wallet/manage" className="text-accent-text underline">Wallets</Link> — the wallet is then
                  without limits again.
                </li>
              </ul>
            </details>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Where the key goes, for an agent on a host or on the owner's machine. */
function HandOff() {
  const [host, setHost] = useState<'hosted' | 'local'>('hosted');
  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {([
          ['hosted', 'My agent runs on a host (Railway, Fly, a server)'],
          ['local', 'My agent runs on my machine (Claude Code, Cursor)'],
        ] as const).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            aria-pressed={host === kind}
            onClick={() => setHost(kind)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              host === kind ? 'border-accent bg-accent text-on-accent' : 'border-border-strong text-foreground hover:border-accent hover:text-accent-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground">
        {host === 'hosted' ? (
          <li>
            Add the key to the service as a variable named <code className="rounded bg-card-muted px-1">OUTLAYER_WK</code>{' '}
            (on Railway: the service, Variables, New Variable). Do not put it in the repository or the prompt.
          </li>
        ) : (
          <li>
            Put the key in the agent&apos;s environment as <code className="rounded bg-card-muted px-1">OUTLAYER_WK</code>:{' '}
            <code className="rounded bg-card-muted px-1">export OUTLAYER_WK=wk_…</code> in the shell that starts it.
          </li>
        )}
        <li>
          Give the agent the skill; it reads the key from <code className="rounded bg-card-muted px-1">OUTLAYER_WK</code>.
          <div className="mt-2">
            <SkillUrlBox url={SKILL_URL} />
          </div>
        </li>
        <li>
          When the agent needs to pay an address that is not on the list, it sends you a link to this page with the
          address filled in. You check it and sign.
        </li>
      </ol>
    </div>
  );
}
