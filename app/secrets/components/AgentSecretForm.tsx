'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { eciesEncrypt } from '@/lib/ecies';
import { getAllWalletKeys } from '@/lib/wallet-keys';
import { listAllUserSecrets } from '@/lib/user-secrets';
import { InfoHint } from '@/components/ui/info-hint';
import { actionCreators } from '@near-js/transactions';

/**
 * Leave a credential for an AGENT — a wallet that has no NEAR of its own.
 *
 * Different from the form beside it in one way that matters: the secret is
 * owned by the agent, not by the connected account. The agent's key never
 * leaves the TEE, so the coordinator asks the keystore to sign the store and
 * hands back a call for YOU to send and pay for. Nothing here invents a new
 * flow — it is the same `Bearer wk_` request the rest of the wallet pages make,
 * the same ECIES the ordinary secrets form uses, and the same "sign what the
 * coordinator prepared" shape as the policy editor.
 */

const DEPOSIT_YOCTO = '100000000000000000000000'; // 0.1 NEAR, excess refunded
/** The most a prepared call may ask this account to attach. */
const MAX_DEPOSIT_YOCTO = BigInt('1000000000000000000000000'); // 1 NEAR
const MAX_GAS = BigInt('300000000000000');

interface PreparedCall {
  contract_id: string;
  method_name: string;
  args: Record<string, unknown>;
  deposit?: string;
  gas: string;
  agent_account: string;
}

/**
 * Refuse a prepared call that is not the one we asked for.
 *
 * Every field arrives over the same wire as the signature that makes it valid,
 * so none of it is trustworthy until checked. Signing it unread would turn this
 * page into a way to get an arbitrary transaction signed by whoever opens it.
 */
/** What an agent's secret is filed against. */
type Scope = { kind: 'project'; projectId: string } | { kind: 'wasm'; hash: string };

/**
 * The accessor the contract will store, in its own JSON.
 *
 * A WASM hash is written in LOWER CASE, because the contract stores one
 * spelling — hex has two, and a secret filed under the shouted one is sealed to
 * a seed the worker never rebuilds.
 */
function accessorOf(scope: Scope): Record<string, unknown> {
  return scope.kind === 'project'
    ? { Project: { project_id: scope.projectId } }
    : { WasmHash: { hash: scope.hash.toLowerCase() } };
}

/** The one field the coordinator's agent-secret endpoints take for this scope. */
function scopeFields(scope: Scope): Record<string, string> {
  return scope.kind === 'project'
    ? { project_id: scope.projectId }
    : { wasm_hash: scope.hash.toLowerCase() };
}

function scopeLabel(scope: Scope): string {
  return scope.kind === 'project' ? scope.projectId : `WASM ${scope.hash.toLowerCase()}`;
}

function checkPrepared(
  prepared: PreparedCall,
  expected: {
    contractId: string;
    method: string;
    scope: Scope;
    agentAccount: string;
    ciphertext?: string;
  },
): string | null {
  if (prepared.contract_id !== expected.contractId) {
    return `The prepared call is addressed to '${prepared.contract_id}', not to ${expected.contractId}. Nothing was signed.`;
  }
  if (prepared.method_name !== expected.method) {
    return `The prepared call invokes '${prepared.method_name}', not '${expected.method}'. Nothing was signed.`;
  }
  const args = prepared.args || {};
  if (JSON.stringify(args.accessor) !== JSON.stringify(accessorOf(expected.scope))) {
    return `The prepared call is filed against something other than '${scopeLabel(expected.scope)}'. Nothing was signed.`;
  }
  if (args.profile !== expected.agentAccount) {
    return `The prepared call stores the secret under '${String(args.profile)}' while reporting the agent as '${expected.agentAccount}'. Nothing was signed.`;
  }
  if (!args.agent_pubkey || !args.wallet_signature) {
    return 'The prepared call carries no wallet signature. The contract would reject it; nothing was signed.';
  }
  if (expected.ciphertext !== undefined && args.encrypted_secrets_base64 !== expected.ciphertext) {
    return 'The prepared call carries different ciphertext than the one just encrypted. Nothing was signed — sending it would store a secret this browser did not produce.';
  }
  if (expected.ciphertext !== undefined && args.access !== 'AllowAll') {
    return 'The prepared call grants a wider audience than the agent itself. Nothing was signed.';
  }
  if (prepared.deposit && BigInt(prepared.deposit) > MAX_DEPOSIT_YOCTO) {
    return `The prepared call asks this account to attach ${prepared.deposit} yoctoNEAR, more than a secret's storage can cost. Nothing was signed.`;
  }
  if (BigInt(prepared.gas) === BigInt(0) || BigInt(prepared.gas) > MAX_GAS) {
    return `The prepared call asks for ${prepared.gas} gas, which is outside what a transaction may attach. Nothing was signed.`;
  }
  return null;
}

/** One line of what an agent already holds. */
interface AgentSecret {
  accessor: { Project?: { project_id: string }; WasmHash?: { hash: string } };
  profile: string;
  updated_at: number;
}

function describeAccessor(a: AgentSecret['accessor']): string {
  if (a?.Project) return a.Project.project_id;
  if (a?.WasmHash) return `WASM ${a.WasmHash.hash.substring(0, 12)}…`;
  return 'unknown';
}

export function AgentSecretForm({
  coordinatorUrl,
  contractId,
  accountId,
  isConnected,
  viewMethod,
  signAndSendTransaction,
}: {
  coordinatorUrl: string;
  contractId: string;
  accountId: string | null;
  isConnected: boolean;
  viewMethod: (params: {
    contractId: string;
    method: string;
    args?: Record<string, unknown>;
  }) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAndSendTransaction: (params: any) => Promise<any>;
}) {
  const [savedKeys, setSavedKeys] = useState<Record<string, { apiKey: string; label?: string }>>({});
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const [pastedKey, setPastedKey] = useState('');
  const [scopeKind, setScopeKind] = useState<'project' | 'wasm'>('project');
  const [projectId, setProjectId] = useState('');
  const [wasmHash, setWasmHash] = useState('');
  const [plaintext, setPlaintext] = useState('{\n  "API_KEY": "your-api-key"\n}');
  const [agentAccount, setAgentAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [held, setHeld] = useState<AgentSecret[] | null>(null);

  useEffect(() => {
    const keys = getAllWalletKeys();
    setSavedKeys(keys);
    const first = Object.keys(keys)[0];
    if (first) setSelectedWallet(first);
  }, []);

  const apiKey = useMemo(() => {
    if (pastedKey.trim()) return pastedKey.trim();
    return selectedWallet ? savedKeys[selectedWallet]?.apiKey ?? '' : '';
  }, [pastedKey, selectedWallet, savedKeys]);

  const hasKey = apiKey.startsWith('wk_');

  // MEMOISED on the strings it is built from. A fresh object every render would
  // change `fetchPubkey`, which the effect below depends on — and the effect
  // fetches, so the page would ask the coordinator who the agent is on a loop.
  const scope: Scope | null = useMemo(() => {
    if (scopeKind === 'project') {
      return projectId.trim() ? { kind: 'project', projectId: projectId.trim() } : null;
    }
    return wasmHash.trim() ? { kind: 'wasm', hash: wasmHash.trim() } : null;
  }, [scopeKind, projectId, wasmHash]);

  /** Who this key speaks for, and the key to seal a secret to it. */
  const fetchPubkey = useCallback(async () => {
    if (!scope) throw new Error('Name a project or a WASM hash first.');
    const query = new URLSearchParams(scopeFields(scope)).toString();
    const resp = await fetch(`${coordinatorUrl}/wallet/v1/agent-secret/pubkey?${query}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Could not get the agent's encryption key (HTTP ${resp.status}): ${body}`);
    }
    return (await resp.json()) as { pubkey: string; seed: string; agent_account: string };
  }, [coordinatorUrl, scope, apiKey]);

  /**
   * What this agent already holds.
   *
   * NOT the list further down the page: that one asks for the CONNECTED
   * account's secrets, and an agent secret belongs to the agent's own implicit
   * account. Without this, storing one succeeded and showed nothing anywhere.
   */
  const loadHeld = useCallback(
    async (agent: string) => {
      try {
        const rows = await listAllUserSecrets<AgentSecret>(viewMethod, contractId, agent);
        setHeld(rows.filter((r) => r.accessor?.Project || r.accessor?.WasmHash));
      } catch {
        setHeld(null);
      }
    },
    [viewMethod, contractId],
  );

  // Show WHO the secret will belong to before anything is typed into it.
  useEffect(() => {
    setAgentAccount(null);
    setHeld(null);
    if (!hasKey || !scope) return;
    let cancelled = false;
    fetchPubkey()
      .then((r) => {
        if (cancelled) return;
        setAgentAccount(r.agent_account);
        loadHeld(r.agent_account);
      })
      .catch(() => {
        /* Shown when the user actually submits — an idle probe should not shout. */
      });
    return () => {
      cancelled = true;
    };
  }, [hasKey, scope, fetchPubkey, loadHeld]);

  const store = async () => {
    setError(null);
    setSuccess(null);

    if (!isConnected || !accountId) {
      setError('Connect your NEAR wallet — it pays the storage deposit and sends the call.');
      return;
    }
    if (!hasKey) {
      setError("Choose the agent's wallet key, or paste one (it starts with wk_).");
      return;
    }
    if (!scope) {
      setError(
        scopeKind === 'project'
          ? "Name the connector's project — 'owner.near/name', as its page reports it."
          : 'Give the WASM hash: 64 hex characters, the sha256 of the binary.',
      );
      return;
    }
    if (scope.kind === 'project' && !scope.projectId.includes('/')) {
      setError("The project is 'owner.near/name' — the connector's project, as its page reports it.");
      return;
    }
    if (scope.kind === 'wasm' && !/^[0-9a-fA-F]{64}$/.test(scope.hash)) {
      setError('A WASM hash is exactly 64 hex characters — the sha256 of the binary.');
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      setError('The secret must be a JSON object: {"API_KEY": "value"}');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
      setError('The secret is empty. Give it at least one key.');
      return;
    }

    setBusy(true);
    try {
      // 1. The key to seal to, and the account this secret will belong to.
      const { pubkey, agent_account } = await fetchPubkey();
      setAgentAccount(agent_account);

      // 2. Encrypt HERE. The coordinator never sees the plaintext.
      const encrypted = eciesEncrypt(pubkey, new TextEncoder().encode(plaintext));
      const encryptedBase64 = Buffer.from(encrypted).toString('base64');

      // 3. The keystore signs; the call comes back for this account to send.
      const prepResp = await fetch(`${coordinatorUrl}/wallet/v1/agent-secret/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          ...scopeFields(scope),
          encrypted_secrets_base64: encryptedBase64,
          payer: accountId,
        }),
      });
      if (!prepResp.ok) {
        const body = await prepResp.text();
        throw new Error(`The coordinator would not prepare the call (HTTP ${prepResp.status}): ${body}`);
      }
      const prepared = (await prepResp.json()) as PreparedCall;

      const complaint = checkPrepared(prepared, {
        contractId,
        method: 'store_agent_secret',
        scope,
        agentAccount: agent_account,
        ciphertext: encryptedBase64,
      });
      if (complaint) throw new Error(complaint);

      // 4. Send it. The receiver is OUR contract id, not the one the answer
      //    named — they were just compared.
      const action = actionCreators.functionCall(
        prepared.method_name,
        prepared.args,
        BigInt(prepared.gas),
        BigInt(prepared.deposit || DEPOSIT_YOCTO),
      );
      const sent = await signAndSendTransaction({ receiverId: contractId, actions: [action] });

      setSuccess(
        `Stored for agent ${agent_account.substring(0, 12)}… on ${scopeLabel(scope)} — paid by ${accountId}. Transaction: ${sent?.transaction?.hash || 'completed'}`,
      );
      // The chain trails a transaction that has only just landed.
      setTimeout(() => loadHeld(agent_account), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    setSuccess(null);

    if (!isConnected || !accountId) {
      setError('Connect your NEAR wallet — it sends the call, and the storage deposit comes back to it.');
      return;
    }
    if (!hasKey || !scope) {
      setError("Choose the agent's wallet key and name the project or WASM hash whose secret should go.");
      return;
    }
    if (!confirm(`Delete the secret left for this agent on ${scopeLabel(scope)}?\n\nThis cannot be undone — the plaintext exists nowhere else.`)) {
      return;
    }

    setBusy(true);
    try {
      const resp = await fetch(`${coordinatorUrl}/wallet/v1/agent-secret/delete/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ ...scopeFields(scope), payer: accountId }),
      });
      if (resp.status === 404) {
        throw new Error(
          'This coordinator has no delete route yet — it arrives with the same deployment as the WASM-hash scope. Storing a secret already works.',
        );
      }
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`The coordinator would not prepare the delete (HTTP ${resp.status}): ${body}`);
      }
      const prepared = (await resp.json()) as PreparedCall;

      const complaint = checkPrepared(prepared, {
        contractId,
        method: 'delete_agent_secret',
        scope,
        agentAccount: prepared.agent_account,
      });
      if (complaint) throw new Error(complaint);

      const action = actionCreators.functionCall(
        prepared.method_name,
        prepared.args,
        BigInt(prepared.gas),
        BigInt(0), // not payable; the deposit travels back to the sender
      );
      const sent = await signAndSendTransaction({ receiverId: contractId, actions: [action] });

      setSuccess(
        `Deleted the secret for agent ${prepared.agent_account.substring(0, 12)}… — the storage deposit went back to ${accountId}. Transaction: ${sent?.transaction?.hash || 'completed'}`,
      );
      setTimeout(() => loadHeld(prepared.agent_account), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const walletOptions = Object.entries(savedKeys);

  return (
 <div className="border border-border rounded-lg bg-card p-5">
 <div className="flex items-start justify-between gap-3">
 <div>
 <h2 className="text-lg font-semibold text-foreground">
            Secret for an agent
 <InfoHint
              className="ml-2"
              text={
 <>
                  An agent is a wallet whose key lives inside the TEE and which owns nothing on
                  NEAR. A secret left here belongs to the AGENT, not to you: only that agent can
                  ever have it decrypted, and only for the connector you name. You pay the storage
                  deposit and send the transaction, because the agent has no NEAR to pay with.
 </>
              }
            />
 </h2>
 <p className="mt-1 text-sm text-muted-foreground">
            Give a connector the credential it should use on this agent&apos;s behalf — an API key
            for the service behind it, for instance. The plaintext is encrypted in this browser and
            never reaches our servers.
 </p>
 </div>
 </div>

      {walletOptions.length === 0 && !pastedKey && (
 <p className="mt-4 text-sm text-muted-foreground">
          No agent wallet key is saved in this browser. Create one on the{' '}
 <a className="text-accent-text underline" href="/wallet/manage">
            wallets page
 </a>
          , or paste a <code className="font-mono">wk_</code> key below.
 </p>
      )}

 <div className="mt-4 grid gap-4">
        {walletOptions.length > 0 && (
 <label className="block">
 <span className="text-sm font-medium text-foreground">Agent key</span>
 <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value)}
              disabled={Boolean(pastedKey.trim())}
            >
              {walletOptions.map(([pubkey, entry]) => (
 <option key={pubkey} value={pubkey}>
                  {entry.label ? `${entry.label} — ` : ''}
                  {pubkey.substring(0, 26)}…
 </option>
              ))}
 </select>
 </label>
        )}

 <label className="block">
 <span className="text-sm font-medium text-foreground">
            …or paste a key
 <InfoHint
              className="ml-2"
              text="The wk_ key of the wallet the agent runs as. It stays in this browser: it is sent to the coordinator to authorise this one request and is never stored on our side."
            />
 </span>
 <input
            type="password"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
            placeholder="wk_…"
            value={pastedKey}
            onChange={(e) => setPastedKey(e.target.value)}
          />
 </label>

 <div>
 <span className="text-sm font-medium text-foreground">
            What may read it
 <InfoHint
              className="ml-2"
              text={
 <>
                  A PROJECT scope lets every version of that connector read the secret — the usual
                  choice, because a connector is updated without its credentials changing. A WASM
                  HASH pins it to one exact build: a rebuild that changes a single byte can no
                  longer open it, which is what you want when the code itself is what you trust.
 </>
              }
            />
 </span>
 <div className="mt-2 flex gap-2">
 <button
              type="button"
              onClick={() => setScopeKind('project')}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                scopeKind === 'project'
                  ? 'border-accent text-accent-text'
                  : 'border-border text-muted-foreground'
              }`}
            >
              Connector project
 </button>
 <button
              type="button"
              onClick={() => setScopeKind('wasm')}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                scopeKind === 'wasm'
                  ? 'border-accent text-accent-text'
                  : 'border-border text-muted-foreground'
              }`}
            >
              One exact build
 </button>
 </div>

          {scopeKind === 'project' ? (
 <label className="mt-3 block">
 <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                placeholder="connectors.outlayer.near/near-email"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              />
 <span className="mt-1 block text-xs text-muted-foreground">
                The secret is readable by this connector alone. The same agent can hold a different
                secret for every connector it uses.
 </span>
 </label>
          ) : (
 <label className="mt-3 block">
 <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
                placeholder="64 hex characters — sha256 of the WASM"
                value={wasmHash}
                onChange={(e) => setWasmHash(e.target.value)}
              />
 <span className="mt-1 block text-xs text-muted-foreground">
                Stored in lower case, the one spelling the worker asks in. The hash does not have
                to exist yet — a secret can wait for the build it belongs to.
 </span>
 </label>
          )}
 </div>

        {agentAccount && (
 <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
 <div>
 <span className="text-muted-foreground">Will belong to agent </span>
 <span className="font-mono break-all">{agentAccount}</span>
 </div>

            {/* What the agent ALREADY holds. The list further down this page is
                the connected account's, and an agent secret is not in it. */}
            {held !== null && (
 <div className="mt-2 border-t border-border pt-2">
                {held.length === 0 ? (
 <span className="text-muted-foreground">This agent holds no secrets yet.</span>
                ) : (
 <>
 <div className="text-muted-foreground">This agent already holds:</div>
 <ul className="mt-1 space-y-1">
                      {held.map((h, i) => (
 <li key={i} className="font-mono break-all">
                          {describeAccessor(h.accessor)}
 </li>
                      ))}
 </ul>
 <div className="mt-1 text-muted-foreground">
                      Storing again for the same one REPLACES it — the old value cannot be
                      recovered.
 </div>
 </>
                )}
 </div>
            )}
 </div>
        )}

 <label className="block">
 <span className="text-sm font-medium text-foreground">Secret</span>
 <textarea
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            rows={5}
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
          />
 </label>

        {error && (
 <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
            {error}
 </div>
        )}
        {success && (
 <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success-text">
            {success}
 </div>
        )}

 <div className="flex flex-wrap gap-2">
 <button
            onClick={store}
            disabled={busy || !isConnected}
 className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Store for agent'}
 </button>
 <button
            onClick={remove}
            disabled={busy || !isConnected}
 className="rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive-text disabled:opacity-50"
          >
            Delete agent secret
 </button>
 </div>
 <p className="text-xs text-muted-foreground">
          Storing costs 0.1 NEAR of storage from your account, refunded when the secret is deleted.
 </p>
 </div>
 </div>
  );
}
