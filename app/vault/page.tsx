'use client';

import { useState, useCallback, useRef } from 'react';

import { useNearWallet } from '@/contexts/NearWalletContext';
import { RequireWallet } from '@/components/ui/require-wallet';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { HashChip } from '@/components/ui/hash-chip';
import {
  buildVaultDeployActions,
  deriveVaultTeeKey,
  formatSeconds,
  getVaultCodeHash,
  getVaultNetworkConfig,
  nsToDate,
  parseExitWindow,
  signVaultVerification,
  VAULT_INITIAL_YOCTO,
  VAULT_LOW_BALANCE_YOCTO,
  VAULT_PARENT_BUDGET_YOCTO,
  VAULT_TOPUP_SUGGESTED_YOCTO,
  verifyVault,
  viewAccountInfo,
  type VerifyReport,
} from '@/lib/vault';

const EXIT_WINDOW_OPTIONS = [
  { label: '24 hours (default)', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
] as const;

const FIELD_CLS =
  'mt-1 block w-full max-w-xl rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent';

export default function VaultPage() {
  const {
    accountId,
    isConnected,
    signAndSendTransaction,
    network,
    rpcUrl,
    viewMethod,
  } = useNearWallet();

  // ── UI state ──────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Synchronous double-submit guard. React's `setBusy` is async (next
  // render), so a fast double-click on Create can fire two atomic-deploy
  // tx requests before the disabled state is applied. The first
  // succeeds, the second hits CreateAccount on the now-existing vault
  // and panics — wallet UI shows two confusing prompts. The ref blocks
  // re-entry within the same event tick.
  const inFlight = useRef(false);

  // Create-vault form
  const [name, setName] = useState('vault');
  const [exitWindow, setExitWindow] = useState<string>('24h');

  // Confirmation that a vault was just deployed in this session.
  // The vault is a master-secret root; API keys are minted
  // separately via `POST /register {"vault_id":...}` (N per vault).
  const [issuedApiKey, setIssuedApiKey] = useState<{
    vault: string;
  } | null>(null);

  // Find / inspect vault
  const [findInput, setFindInput] = useState('');
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
  const [report, setReport] = useState<VerifyReport | null>(null);

  const refreshReport = useCallback(
    async (vaultId: string) => {
      try {
        const r = await verifyVault(viewMethod, rpcUrl, network, vaultId);
        setReport(r);
        setActiveVaultId(vaultId);
      } catch (e) {
        setReport(null);
        setError(`Failed to load vault state: ${(e as Error).message}`);
      }
    },
    [viewMethod, rpcUrl, network],
  );

  // ── Create vault ──────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (inFlight.current) return; // synchronous double-submit guard
    if (!isConnected || !accountId) return;
    setError(null);
    setSuccess(null);
    setIssuedApiKey(null);

    // NEAR sub-account name rule: lowercase a-z, 0-9, `_`, `-`,
    // 2-64 chars per label, no leading/trailing/consecutive separators.
    // Matching the parser at near-account-id ensures the wallet popup
    // doesn't surface a cryptic "InvalidAccountId" after the user
    // already approved the deploy.
    const NAME_RE = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
    if (!NAME_RE.test(name)) {
      setError(
        "Name must be 1-64 lowercase letters, digits, '_' or '-' " +
          "(no dots, uppercase, leading/trailing separators). E.g. 'vault'.",
      );
      return;
    }

    let exitSecs: number;
    try {
      exitSecs = parseExitWindow(exitWindow);
    } catch (e) {
      setError((e as Error).message);
      return;
    }

    const vaultAccountId = `${name}.${accountId}`;
    inFlight.current = true;
    setBusy('Pre-flight checks…');

    try {
      // 0a. Vault must NOT already exist.
      const existing = await viewAccountInfo(rpcUrl, vaultAccountId);
      if (existing.exists) {
        throw new Error(
          `${vaultAccountId} already exists. If a previous deploy crashed before \
registration, use the "Resume" button below. Otherwise pick a different name.`,
        );
      }

      // 0b. Parent must hold enough NEAR.
      const parentInfo = await viewAccountInfo(rpcUrl, accountId);
      if (!parentInfo.exists) {
        throw new Error(`Parent account ${accountId} does not exist on ${network}.`);
      }
      const balance = BigInt(parentInfo.amountYocto);
      if (balance < VAULT_PARENT_BUDGET_YOCTO) {
        throw new Error(
          `Parent ${accountId} has only ${(Number(balance) / 1e24).toFixed(3)} NEAR; \
deploy requires at least ${(Number(VAULT_PARENT_BUDGET_YOCTO) / 1e24).toFixed(2)} NEAR \
(${(Number(VAULT_INITIAL_YOCTO) / 1e24).toFixed(2)} for the vault + ~0.1 NEAR gas).`,
        );
      }

      // 1. Resolve vault code hash from keystore-DAO.
      //
      // `getVaultCodeHash` view-calls `list_approved_vault_versions`
      // and picks the most recently approved non-deprecated entry.
      // No env-var to keep in sync — when the DAO whitelists a new
      // vault version, the dashboard picks it up automatically.
      // Bails with a clear error if no non-deprecated version exists.
      setBusy('Resolving vault code hash from keystore-DAO…');
      const { hashBytes } = await getVaultCodeHash(viewMethod, network);

      // 2. TEE pubkey BEFORE deploy.
      setBusy('Fetching TEE function-call pubkey…');
      const teePubkey = await deriveVaultTeeKey(network, vaultAccountId);

      // 3. Atomic deploy via UseGlobalContract — references the
      //    on-chain global vault contract by hash instead of shipping
      //    the 150 KB WASM in this tx. Tx payload < 1 KB so it fits
      //    inside MyNearWallet's URL limit.
      setBusy('Signing atomic deploy (5 actions, global contract by hash)…');
      const cfg = getVaultNetworkConfig(network);
      const actions = buildVaultDeployActions({
        parent: accountId,
        vaultAccountId,
        keystoreDaoId: cfg.keystoreDaoId,
        mpcContractId: cfg.mpcContractId,
        exitWindowSecs: exitSecs,
        wasmCodeHash: hashBytes,
        teePublicKey: teePubkey,
      });
      const outcome = await signAndSendTransaction({
        receiverId: vaultAccountId,
        actions,
      });
      const txHash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || '<unknown>';

      // 4. Drive sign-verification (mark_vault_verified). Deploy
      //    stops here — the vault is now usable as a master-secret
      //    root. API keys are minted separately via `POST /register
      //    {"vault_id": "<vault>"}` (N keys per vault allowed), so
      //    we do NOT auto-call `/customer/register` here.
      //
      // Wait for the just-deployed account to be visible at FINAL
      // finality BEFORE we hand it to the keystore. The atomic
      // deploy tx returned at "executed" finality (the
      // `signAndSendTransaction` call), but the RPC node the
      // keystore-worker uses for its own `view_account` re-check can
      // still be a few blocks behind. Without this poll, sign-
      // verification 400s with UNKNOWN_ACCOUNT and the dashboard
      // shows the cryptic error a user just hit.
      setBusy('Waiting for vault account to be visible at final finality…');
      let vaultVisible = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const probe = await viewAccountInfo(rpcUrl, vaultAccountId);
        if (probe.exists) {
          vaultVisible = true;
          break;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      if (!vaultVisible) {
        throw new Error(
          `Atomic deploy tx ${txHash} landed but ${vaultAccountId} is still not visible at final finality after 20 s. ` +
            `Click "Resume" below to retry sign-verification.`,
        );
      }

      setBusy('Triggering on-chain mark_vault_verified…');
      await signVaultVerification(network, vaultAccountId);

      // Poll for verified state. `signVaultVerification` returns as
      // soon as the keystore-worker has BROADCAST the
      // `mark_vault_verified` tx, but RPC nodes can lag 1-5 s before
      // it shows up at FINAL finality. Without this poll, the
      // verify-block right below the success banner snapshots the
      // pre-tx state and shows "NOT VERIFIED" — exactly the bug a
      // user just hit.
      setBusy('Waiting for on-chain verification to land…');
      let verifiedReport: Awaited<ReturnType<typeof verifyVault>> | null = null;
      for (let attempt = 0; attempt < 15; attempt++) {
        const r = await verifyVault(viewMethod, rpcUrl, network, vaultAccountId);
        if (r.isVerified) {
          verifiedReport = r;
          break;
        }
        await new Promise((res) => setTimeout(res, 1500));
      }

      setIssuedApiKey({ vault: vaultAccountId });
      if (verifiedReport) {
        setReport(verifiedReport);
        setActiveVaultId(vaultAccountId);
        setSuccess(`Vault deployed and verified (tx ${txHash}).`);
      } else {
        // 15 attempts × 1.5 s = 22.5 s of polling. If we still don't
        // see daoVerified, surface a soft warning and let the user
        // retry with the "Refresh" button; the deploy itself
        // succeeded.
        await refreshReport(vaultAccountId);
        setSuccess(
          `Vault deployed (tx ${txHash}). Verification tx not visible at final finality yet — click "Refresh" in 10-30s to confirm.`,
        );
      }
    } catch (e) {
      setError(`Vault init failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  };

  // ── Resume an interrupted init ────────────────────────────────────────
  // Only step 4 (mark_vault_verified) needs resumption — atomic
  // deploy is all-or-nothing, and API key minting is now a
  // separate user-driven step (POST /register with vault_id).
  const handleResume = async (vaultAccountId: string) => {
    if (!vaultAccountId) return;
    setError(null);
    setSuccess(null);
    setIssuedApiKey(null);
    setBusy(`Resuming ${vaultAccountId}…`);
    try {
      await signVaultVerification(network, vaultAccountId);
      setIssuedApiKey({ vault: vaultAccountId });
      setSuccess('Vault verification completed.');
      await refreshReport(vaultAccountId);
    } catch (e) {
      setError(`Resume failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  // ── Inspect / refresh ─────────────────────────────────────────────────
  const handleFind = async () => {
    setError(null);
    setSuccess(null);
    if (!findInput.trim()) {
      setError('Enter a vault account id (e.g. vault.alice.near).');
      return;
    }
    setBusy(`Loading ${findInput.trim()}…`);
    try {
      await refreshReport(findInput.trim());
    } finally {
      setBusy(null);
    }
  };

  // ── Recovery / window / add-key actions ──────────────────────────────
  // All call directly into the vault contract; the parent NEAR account is
  // the only signer that can use the predecessor-gated paths.
  // Recovery operations (`initiate_*_recovery`, `finalize_recovery`,
  // `set_exit_window`, `unlocked_add_key`) are intentionally CLI-only.
  // The recovery flow runs in the "OutLayer is potentially dead /
  // compromised" scenario, so it must not depend on web infrastructure
  // we host. The walkthrough at `scripts/customer-recovery/` is the
  // single recovery surface — it generates the keypair locally, drives
  // initiate/wait/finalize via `outlayer vault ...`, and recovers the
  // per-vault master via the `customer-recovery` binary calling MPC
  // directly. The dashboard's job is limited to: deploy + status +
  // verify. Anything that mutates an already-deployed vault belongs
  // in the CLI.

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="w-full">
      {/* Header. The double stroke is the OutLayer "layer shift" mark: the
          faint bar is the base layer, the amber one is the same stroke moved
          out in front — same story as the » in the wordmark. It also makes
          the h1 start on the same vertical line as card content (pl-5 =
          CardHeader padding), so the page reads as one aligned column. */}
      <div className="relative mb-6 pl-5">
        <span
          aria-hidden="true"
          className="absolute bottom-0.5 left-0 top-[9px] w-[3px] rounded-full bg-border-strong"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-[9px] left-[7px] top-0.5 w-[3px] rounded-full bg-gradient-to-b from-accent to-accent/40"
        />
        <h1 className="text-xl font-bold tracking-tight">Vaults</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-customer custody roots: on-chain CKD-issuer contracts bound to your NEAR account.
        </p>
      </div>

      {/* Feedback banners */}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success-text">
          {success}
        </div>
      )}
      {busy && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-card-muted p-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-b-2 border-accent" aria-hidden="true" />
          {busy}
        </div>
      )}

      {issuedApiKey && <IssuedVaultPanel data={issuedApiKey} />}

      {!isConnected && (
        <div className="mb-6">
          <RequireWallet subject="vault deployment" />
        </div>
      )}

      {/* ── Create vault ─────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Create vault</CardTitle>
          <CardDescription>
            Deploys <code>{name || 'vault'}.{accountId || '<your-account>'}</code> with a single
            atomic NEAR transaction (CreateAccount + Transfer{' '}
            {(Number(VAULT_INITIAL_YOCTO) / 1e24).toFixed(2)} NEAR + DeployContract + new() +
            AddKey TEE function-call key).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-medium">Sub-account name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={FIELD_CLS}
                placeholder="vault"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium">Unilateral exit window</span>
              <select
                value={exitWindow}
                onChange={(e) => setExitWindow(e.target.value)}
                className={FIELD_CLS}
              >
                {EXIT_WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4">
            <Button onClick={handleCreate} disabled={!isConnected || !!busy}>
              Create vault
            </Button>
          </div>
          <p className="mt-3 max-w-3xl text-xs text-faint-foreground">
            Parent (= your account, immutable post-deploy) is the only NEAR account that can
            call <code>unilateral_initiate_recovery</code>, <code>set_exit_window</code>, or{' '}
            <code>unlocked_add_key</code>.
          </p>
        </CardContent>
      </Card>

      {/* ── Find / inspect vault ─────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Inspect a vault</CardTitle>
          <CardDescription>
            Load any vault&apos;s on-chain state and run the defense-in-depth verification checks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex max-w-xl flex-wrap gap-2">
            <input
              type="text"
              value={findInput}
              onChange={(e) => setFindInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFind()}
              placeholder="vault.alice.near"
              className="min-w-0 flex-1 rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            <Button variant="outline" onClick={handleFind} disabled={!!busy}>
              Load
            </Button>
            <Button
              variant="outline"
              onClick={() => findInput.trim() && handleResume(findInput.trim())}
              disabled={!isConnected || !!busy || !findInput.trim()}
              title="Re-run sign-verification against an already-deployed vault"
            >
              Resume
            </Button>
          </div>

          {report && activeVaultId && (
            <div className="mt-4">
              <VaultDetailPanel report={report} onRefresh={() => refreshReport(activeVaultId)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informational plate — one per page, last */}
      <div className="max-w-3xl rounded-lg border border-border bg-card-muted p-4">
        <h2 className="text-sm font-semibold">About vaults</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A vault is a CKD-issuer contract bound to your NEAR account. OutLayer&apos;s keystore TEE
          derives your per-customer master <em>inside the enclave</em> via NEAR&apos;s MPC network;
          from that master it generates keys for your agents&apos; wallets, encrypted secrets, and
          payment checks on demand — without anyone seeing the raw master.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          You either let OutLayer&apos;s TEE manage the vault, or later take it over yourself (run
          it from your own TEE / runtime, or use the master manually). It&apos;s a one-way switch:
          once you take over, OutLayer stops serving the vault — but you keep every derived key,
          because the same MPC path reproduces the same master.
        </p>
        <details className="mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer font-medium text-foreground">What is CKD?</summary>
          <div className="mt-2 space-y-2">
            <p>
              <strong className="text-foreground">Conditional Key Derivation</strong> is a NEAR MPC
              primitive. The MPC network&apos;s threshold-key holders jointly derive a private key
              for a given <em>app id</em> — deterministically, without any single node ever
              assembling the secret. The key is unique to the predecessor account that requested
              it.
            </p>
            <p>
              Here, the predecessor is your vault contract and the app id is an HMAC of{' '}
              <code>vault-master:{'<your_vault_id>'}</code>. The keystore TEE asks NEAR MPC for
              the 32 bytes; same inputs &rArr; same master, every time. From that master, all your
              wallet keys and secret-encryption keys are HKDF-derived inside the enclave.
              Detaching from OutLayer = you query the same MPC path from the vault account and get
              the same master back.{' '}
              <a className="text-accent-text hover:underline" href="/docs/vaults">
                Full explanation
              </a>
              .
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}

// ─── Issued vault panel ────────────────────────────────────────────────────
//
// Shown right after a successful CKD-issuer (a.k.a. "vault") deploy.
// The contract itself is just an on-chain admin/governance container
// that binds a per-customer master inside the keystore TEE via MPC CKD.
// From that master OutLayer derives an unbounded family of keypairs on
// demand (`wallet:{wallet_id}:near`, `wallet:{wallet_id}:eth`,
// `check:{counter}`, `vault-master:...`, etc.). Treating any individual
// derivation as "the wallet" is misleading — there is no canonical
// wallet, the keystore mints whichever address the current call needs.
//
// What matters is the contract account and its recoverability.
// API keys (`wk_...`) are minted separately on demand via
// `POST /register {"vault_id": ...}` — N keys per vault allowed —
// so the panel here surfaces only the vault id itself.
function IssuedVaultPanel({
  data,
}: {
  data: { vault: string };
}) {
  return (
    <div className="mb-6 max-w-3xl rounded-md border border-success/30 bg-success/10 p-4">
      <h3 className="text-sm font-semibold text-success-text">
        Custody contract deployed and verified
      </h3>
      <div className="mt-2 space-y-2 text-sm text-foreground">
        <div>
          <HashChip value={data.vault} trim={0} />
        </div>
        <p className="text-xs text-muted-foreground">
          On-chain CKD issuer. Binds your per-customer master inside the keystore TEE (via MPC
          CKD) so OutLayer can derive keys for your agents, secrets, and payment checks on demand.
          No funds live on this contract — it&apos;s a governance/recovery root.
        </p>
        <p className="text-xs text-muted-foreground">
          If OutLayer stops serving, the parent account regains control via{' '}
          <code>initiate_unilateral_recovery</code> → <code>finalize_recovery</code>, and the
          per-customer master is recoverable via the <code>customer-recovery</code> script.
        </p>
        <div className="rounded-md border border-border bg-card-muted px-3 py-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Keep it funded:</strong> deriving the vault&rsquo;s
          master key calls <code>vault.request_master</code> on-chain, and NEAR makes this account{' '}
          <em>prepay</em> the gas (~0.3 NEAR reserved, most refunded). If the vault runs out of
          NEAR the derive fails and sub-agent wallets can&rsquo;t be minted or read. This re-runs
          whenever the OutLayer keystore is updated, so keep a standing balance. The vault was
          funded with {(Number(VAULT_INITIAL_YOCTO) / 1e24).toFixed(2)} NEAR at deploy — top it up
          (send NEAR to <code>{data.vault}</code>) before it drops low; the dashboard shows a
          prompt below {(Number(VAULT_LOW_BALANCE_YOCTO) / 1e24).toFixed(2)} NEAR.
        </div>
      </div>
    </div>
  );
}

// ─── Detail panel ───────────────────────────────────────────────────────────

function VaultDetailPanel(props: {
  report: VerifyReport;
  onRefresh: () => void;
}) {
  const { report } = props;

  if (!report.exists) {
    return (
      <EmptyState
        className="max-w-3xl"
        title="Vault not found"
        description={`Account ${report.vaultId} does not exist on chain.`}
      />
    );
  }
  const s = report.state;

  return (
    <div className="max-w-3xl rounded-lg border border-border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{report.vaultId}</h3>
        <Button variant="outline" size="sm" onClick={props.onRefresh}>
          Refresh
        </Button>
      </div>

      <div
        className={`mt-3 rounded-md border p-3 text-sm font-medium ${
          report.safe
            ? 'border-success/30 bg-success/10 text-success-text'
            : 'border-destructive/30 bg-destructive/10 text-destructive-text'
        }`}
      >
        {report.safe
          ? 'PASS — verified, all defense-in-depth checks OK'
          : report.isVerified
            ? 'NOT SAFE — defense-in-depth checks failed (do not deposit)'
            : 'NOT VERIFIED — vault is not in keystore-DAO verified set'}
      </div>

      {report.warnings.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
          {report.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {s && (
        <table className="mt-3 w-full text-xs">
          <tbody>
            <tr className="border-b border-border">
              <td className="w-44 py-1.5 pr-3 align-top text-muted-foreground">Parent</td>
              <td className="py-1.5"><HashChip value={s.parent} trim={0} /></td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-1.5 pr-3 align-top text-muted-foreground">keystore-DAO</td>
              <td className="py-1.5"><HashChip value={s.keystore_dao} trim={0} /></td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-1.5 pr-3 align-top text-muted-foreground">MPC contract</td>
              <td className="py-1.5"><HashChip value={s.mpc_contract} trim={0} /></td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-1.5 pr-3 align-top text-muted-foreground">Status</td>
              <td className="py-1.5">
                {s.unlocked ? 'UNLOCKED (recovered)' : 'locked (TEE-controlled)'}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td className="py-1.5 pr-3 align-top text-muted-foreground">Exit window</td>
              <td className="py-1.5 tabular-nums">{formatSeconds(s.unilateral_exit_window_secs)}</td>
            </tr>
            <tr className="border-b border-border">
              <td
                className="py-1.5 pr-3 align-top text-muted-foreground"
                title="Vault account balance. Outbound MPC-CKD calls (vault.request_master → mpc.request_app_private_key) burn gas from this balance. Top up if low."
              >
                Balance
              </td>
              <td className="py-1.5 tabular-nums">
                {(Number(report.amountYocto) / 1e24).toFixed(4)} NEAR
                {BigInt(report.amountYocto) < VAULT_LOW_BALANCE_YOCTO && (
                  <span className="ml-2 font-medium text-warning">low — top up below</span>
                )}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td
                className="py-1.5 pr-3 align-top text-muted-foreground"
                title="Custody wallets minted under this vault via POST /register {vault_id} and PUT /api-key (sub-agents). Each wallet has its own wk_ API key and a distinct derived address; all share the per-vault master inside the keystore TEE."
              >
                Custody wallets
              </td>
              <td className="py-1.5">
                {report.walletCount === null ? (
                  <span className="text-faint-foreground">unknown (coordinator lookup failed)</span>
                ) : (
                  <>
                    <strong className="tabular-nums">{report.walletCount}</strong>
                    {report.walletCount === 0 && (
                      <span className="text-muted-foreground">
                        {' '}
                        — none minted yet; <code>POST /register {`{"vault_id":"${report.vaultId}"}`}</code>
                      </span>
                    )}
                  </>
                )}
              </td>
            </tr>
            <tr className="border-b border-border">
              <td
                className="py-1.5 pr-3 align-top text-muted-foreground"
                title="The initial TEE function-call key the customer installed via AddKey in the atomic deploy. finalize_recovery deletes this (plus all registered_tee_keys) atomically when the customer hands the vault to a sovereign key."
              >
                Initial TEE key
              </td>
              <td className="py-1.5">
                {s.initial_tee_key ? (
                  <HashChip value={s.initial_tee_key} trim={12} />
                ) : (
                  <span className="text-faint-foreground">(none — legacy vault)</span>
                )}
              </td>
            </tr>
            <tr className={s.recovery ? 'border-b border-border' : ''}>
              <td
                className="py-1.5 pr-3 align-top text-muted-foreground"
                title="DAO-rotated TEE keys added via propose_tee_key. finalize_recovery deletes all of these atomically together with the initial TEE key."
              >
                Registered TEE keys (DAO rotated)
              </td>
              <td className="py-1.5">
                {s.registered_tee_keys.length}
                {s.registered_tee_keys.length === 0 && report.safe && (
                  <span className="text-faint-foreground">
                    {' '}
                    — none rotated; initial TEE key (above) is the active one
                  </span>
                )}
              </td>
            </tr>
            {s.recovery && (
              <tr>
                <td className="py-1.5 pr-3 align-top text-muted-foreground">Recovery</td>
                <td className="py-1.5">
                  {s.recovery.trigger} — finalize after{' '}
                  {nsToDate(s.recovery.finalize_after).toLocaleString()}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Agent integration hint — only shown for safe vaults to avoid
          pointing customers at a vault they shouldn't yet use. */}
      {report.safe && (
        <div className="mt-3 rounded-md border border-border bg-card-muted p-3 text-xs">
          <div className="font-medium text-foreground">Use this vault with an AI agent</div>
          <p className="mt-1 text-muted-foreground">
            Drop the{' '}
            <a
              href="https://skills.outlayer.ai/agent-custody/SKILL.md"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-text hover:underline"
            >
              agent-custody skill
            </a>{' '}
            into your agent (Claude, Cursor, your own LLM tool). It teaches the agent how to mint
            a custody wallet under <code>{report.vaultId}</code> via <code>POST /register</code>,
            derive on-chain addresses, sign messages, send transfers and cross-chain swaps, all
            backed by your per-customer master inside the keystore TEE. The agent will not be able
            to deploy or recover the vault itself — those are user actions — but it can use any
            number of derived custody wallets you authorise it to mint.
          </p>
        </div>
      )}

      {/* Top-up prompt — shown whenever the vault balance is low. The
          gas to refresh the per-customer master via MPC-CKD is paid
          out of this balance, so an empty vault wedges the keystore's
          ability to keep serving derived keys for this customer until
          the parent (or anyone, NEAR transfers are permissionless)
          tops it up. */}
      {report.exists && BigInt(report.amountYocto) < VAULT_LOW_BALANCE_YOCTO && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4 shrink-0 text-warning"
              aria-hidden="true"
            >
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            Vault balance is low
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <code>{report.vaultId}</code> has{' '}
            <strong className="tabular-nums">
              {(Number(report.amountYocto) / 1e24).toFixed(4)} NEAR
            </strong>
            . Outbound MPC-CKD calls (<code>vault.request_master</code>) burn gas from this
            account. Once the balance goes below storage stake the keystore stops being able to
            refresh your master, and any derived-key request that requires re-fetching it will
            stall.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Top up by transferring NEAR to <code>{report.vaultId}</code> from any account —
            it&rsquo;s a plain on-chain transfer, no contract method. Suggested:{' '}
            <strong className="tabular-nums">
              {(Number(VAULT_TOPUP_SUGGESTED_YOCTO) / 1e24).toFixed(2)} NEAR
            </strong>{' '}
            (~100 MPC calls of headroom).
          </p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-card p-2 text-xs">
{`# CLI:
near send <your_account> ${report.vaultId} ${(Number(VAULT_TOPUP_SUGGESTED_YOCTO) / 1e24).toFixed(2)}

# or any wallet — Send NEAR to ${report.vaultId}`}
          </pre>
        </div>
      )}

      {/* Recovery, exit-window changes, post-unlock key installation
          are intentionally CLI-only. The recovery flow assumes
          OutLayer's web infra may be unreliable (the whole point of
          self-custody is to not depend on us), so trusting the
          dashboard with the sovereignty handover would defeat the
          design. Tools:
            * `outlayer vault {initiate-unilateral-recovery,
              initiate-recovery, finalize-recovery, set-exit-window,
              unlocked-add-key}` — single ops.
            * `scripts/customer-recovery/walkthrough.sh` — end-to-end
              keygen → initiate → wait → finalize → master-recovery. */}
      {(s?.recovery || s?.unlocked) && (
        <div className="mt-3 rounded-md border border-border bg-card-muted p-3 text-xs text-muted-foreground">
          {s.recovery ? (
            <>
              <strong className="text-foreground">Recovery in progress.</strong> Finalize with{' '}
              <code className="rounded bg-card px-1">
                outlayer vault finalize-recovery {report.vaultId} &lt;your_new_pubkey&gt;
              </code>{' '}
              after the timer elapses. Generate the keypair locally via{' '}
              <code className="rounded bg-card px-1">customer-recovery generate-key</code>.
            </>
          ) : (
            <>
              <strong className="text-foreground">Vault is unlocked.</strong> Recover the
              per-vault master locally with{' '}
              <code className="rounded bg-card px-1">
                customer-recovery --vault-id {report.vaultId} --from-chain
              </code>{' '}
              if you haven&rsquo;t already.
            </>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-faint-foreground">
        Recovery, exit-window, and post-unlock key operations are CLI-only — see{' '}
        <code className="rounded bg-card-muted px-1">outlayer vault --help</code> and{' '}
        <a
          className="underline hover:text-foreground"
          href="https://github.com/out-layer/near-offshore/tree/main/scripts/customer-recovery"
          target="_blank"
          rel="noopener noreferrer"
        >
          scripts/customer-recovery/
        </a>
        .
      </p>
    </div>
  );
}
