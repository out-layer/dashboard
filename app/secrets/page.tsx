'use client';

import { CopyText } from '@/components/ui/copy-text';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { actionCreators } from '@near-js/transactions';
import { SecretsForm } from './components/SecretsForm';
import { AgentSecretForm } from './components/AgentSecretForm';
import { SecretsList } from './components/SecretsList';
import { AccessEditor, GranteeWallet } from './components/AccessEditor';
import { UserSecret, FormData, isRepoAccessor, isWasmHashAccessor, isProjectAccessor, getAccessorLabel } from './components/types';
import { grantsOf, withoutGrant, implicitAccountOf, nsToIsoUtc, openPersonalRows, chainReadRefusal, buildHashRefusal } from './components/utils';
import { getCoordinatorApiUrl } from '@/lib/api';
import { listAllUserSecrets } from '@/lib/user-secrets';

// useSearchParams needs a Suspense boundary, otherwise the whole route opts out of static
// rendering and the build fails.
export default function SecretsPage() {
  return (
    <Suspense fallback={null}>
      <SecretsPageContent />
    </Suspense>
  );
}

function SecretsPageContent() {
  const { accountId, isConnected, signAndSendTransaction, contractId, viewMethod, network } = useNearWallet();

  // A link can propose WHICH secret to create — never its value, and never the access condition.
  // Anything sensitive would end up in browser history, referrers and proxy logs.
  const searchParams = useSearchParams();
  const linkProject = searchParams.get('project')?.trim() || '';
  const linkProfile = searchParams.get('profile')?.trim() || '';
  const linkName = searchParams.get('name')?.trim() || '';
  const linkGenerate = searchParams.get('generate')?.trim() || '';
  // From an execution's details: the SHA-256 of the bytes that ran. The form locks the
  // row's access condition to that build ("One build only", ANDed with the default).
  const linkWasmHash = searchParams.get('wasm_hash')?.trim() || '';
  // `access=1` is a different kind of link: not "create this secret" but "open
  // who may read the one that exists" — where a connector's owner page sends a
  // person to grant their agent. It must not reach the create form at all:
  // that form, prefilled with an existing row's name, is an offer to overwrite it.
  const linkAccess = searchParams.get('access') === '1' && Boolean(linkProject);
  const fromLink = !linkAccess && Boolean(linkProject || linkProfile || linkName || linkGenerate || linkWasmHash);
  const coordinatorUrl = getCoordinatorApiUrl(network);

  // User's secrets list
  const [userSecrets, setUserSecrets] = useState<UserSecret[]>([]);
  const [loadingSecrets, setLoadingSecrets] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit mode
  const [editingSecret, setEditingSecret] = useState<UserSecret | null>(null);

  // Update mode (preserves PROTECTED_ secrets)
  const [updatingSecret, setUpdatingSecret] = useState<UserSecret | null>(null);
  // The secret whose readers are being changed (update_access; the value stays).
  const [accessSecret, setAccessSecret] = useState<UserSecret | null>(null);
  /** The access form was opened by a link, so it is what the visitor came for. */
  const [accessFromLink, setAccessFromLink] = useState(false);
  const openedFromLink = useRef(false);
  // The custody wallets this account owns, as grantees: a grant names the
  // wallet's implicit account, which is what pays for its calls.
  const [wallets, setWallets] = useState<GranteeWallet[]>([]);
  useEffect(() => {
    if (!isConnected || !accountId) {
      setWallets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = (await viewMethod({
          contractId,
          method: 'get_wallet_policies_by_owner',
          args: { owner: accountId },
        })) as Array<{ wallet_pubkey?: string }> | null;
        const found: GranteeWallet[] = [];
        for (const row of rows ?? []) {
          const pubkey = row.wallet_pubkey ?? '';
          const account = implicitAccountOf(pubkey);
          if (account) found.push({ account, label: pubkey.slice(0, 16) + '…' });
        }
        if (!cancelled) setWallets(found);
      } catch {
        if (!cancelled) setWallets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, accountId, contractId, viewMethod]);

  // Saving replaces whatever is already stored for the same project+profile, and a replaced
  // generated key cannot be recovered — the private half only ever existed inside the enclave.
  // The transaction gives no hint either: the old deposit is credited back, so the wallet shows
  // roughly zero. Detect the collision from the list we already loaded and say so up front.
  // The row a link would replace, if it is already stored. Used twice: to warn
  // about the overwrite, and to hand the form the condition that row already
  // has — a link must never quietly re-decide who may read an existing secret.
  // A link that names a project and no profile lands on `default` — the form's
  // own default — so that is the row it may overwrite, and the row whose
  // condition it must carry.
  const linkEffectiveProfile = linkProject ? linkProfile || 'default' : linkProfile;
  const linkTarget =
    fromLink && Boolean(linkProject)
      ? userSecrets.find(
          (s) =>
            s.accessor &&
            isProjectAccessor(s.accessor) &&
            s.accessor.Project.project_id === linkProject &&
            s.profile === linkEffectiveProfile
        )
      : undefined;
  const linkOverwrites = Boolean(linkTarget);

  // An access link, once the rows are in: open the form of the row it names, as
  // if its own Access button had been pressed. Once — a refresh of the list must
  // not reopen a form the visitor has closed.
  useEffect(() => {
    if (!linkAccess || openedFromLink.current || loadingSecrets || userSecrets.length === 0) return;
    const wanted = linkProfile || 'default';
    const row = userSecrets.find(
      (s) => s.accessor && isProjectAccessor(s.accessor) && s.accessor.Project.project_id === linkProject && s.profile === wanted,
    );
    openedFromLink.current = true;
    if (row) {
      setAccessSecret(row);
      setAccessFromLink(true);
    } else {
      setError(`This account has no secret “${wanted}” for ${linkProject}, so there is nothing to grant access to yet.`);
    }
  }, [linkAccess, linkProject, linkProfile, loadingSecrets, userSecrets]);

  // The form's three prop objects are built here, memoised on the state they
  // come from, so their identity changes only when the edited or updated
  // secret does — the form's edit and update effects reload its fields when
  // they see a new object, and a new object on every render of this page (a
  // success banner timer, a list refresh) would wipe what the user is typing.
  const prefill = useMemo(
    () =>
      fromLink && !editingSecret && !updatingSecret
        ? {
            projectId: linkProject,
            profile: linkEffectiveProfile,
            secretName: linkName,
            generationType: linkGenerate,
            wasmHash: linkWasmHash,
          }
        : undefined,
    [fromLink, editingSecret, updatingSecret, linkProject, linkEffectiveProfile, linkName, linkGenerate, linkWasmHash]
  );
  const initialData = useMemo(
    () =>
      editingSecret && editingSecret.accessor
        ? isRepoAccessor(editingSecret.accessor)
          ? {
              sourceType: 'repo' as const,
              repo: editingSecret.accessor.Repo.repo,
              branch: editingSecret.accessor.Repo.branch || '',
              wasmHash: '',
              profile: editingSecret.profile,
              access: editingSecret.access,
            }
          : isWasmHashAccessor(editingSecret.accessor)
          ? {
              sourceType: 'wasm_hash' as const,
              repo: '',
              branch: '',
              wasmHash: editingSecret.accessor.WasmHash.hash,
              profile: editingSecret.profile,
              access: editingSecret.access,
            }
          : isProjectAccessor(editingSecret.accessor)
          ? {
              sourceType: 'project' as const,
              repo: '',
              branch: '',
              wasmHash: '',
              profile: editingSecret.profile,
              access: editingSecret.access,
            }
          : undefined
        : undefined,
    [editingSecret]
  );
  const updateMode = useMemo(
    () =>
      updatingSecret && updatingSecret.accessor
        ? {
            accessor: isRepoAccessor(updatingSecret.accessor)
              ? {
                  type: 'Repo' as const,
                  repo: updatingSecret.accessor.Repo.repo,
                  branch: updatingSecret.accessor.Repo.branch || null,
                }
              : isWasmHashAccessor(updatingSecret.accessor)
              ? {
                  type: 'WasmHash' as const,
                  hash: updatingSecret.accessor.WasmHash.hash,
                }
              : isProjectAccessor(updatingSecret.accessor)
              ? {
                  type: 'Project' as const,
                  project_id: updatingSecret.accessor.Project.project_id,
                }
              : {
                  type: 'Repo' as const,
                  repo: '',
                  branch: null,
                },
            profile: updatingSecret.profile,
            access: updatingSecret.access,
            // `undefined` delegates the `get_secret_vault` view-call to the form,
            // which inherits the existing binding; anything else would re-bind a
            // vault-scoped secret to the default master on update.
            vaultId: undefined,
          }
        : undefined,
    [updatingSecret]
  );

  const loadUserSecrets = useCallback(async () => {
    if (!accountId) return;

    setLoadingSecrets(true);

    try {
      // Paged: the contract answers a window, not the whole list.
      const secrets = await listAllUserSecrets<UserSecret>(viewMethod, contractId, accountId);

      // Filter out System accessor (Payment Keys) - those are managed on /payment-keys page
      const filteredSecrets: UserSecret[] = (Array.isArray(secrets) ? secrets : []).filter(
        (s: UserSecret) => {
          if (!s.accessor || typeof s.accessor !== 'object') return true;
          return !('System' in s.accessor);
        }
      );

      // Show the list immediately so the page isn't blocked on vault
      // lookups, then enrich each entry in parallel with its on-chain
      // vault-id binding. `get_secret_vault` returns null for legacy
      // default-master secrets and the vault account id for vault-bound
      // ones; the result back-fills the badge in `SecretCard` without
      // re-rendering anything else.
      setUserSecrets(filteredSecrets);

      const enriched = await Promise.all(
        filteredSecrets.map(async (s) => {
          try {
            const v = await viewMethod({
              contractId,
              method: 'get_secret_vault',
              args: { accessor: s.accessor, profile: s.profile, owner: accountId },
            });
            return { ...s, vault_id: typeof v === 'string' ? v : null };
          } catch {
            return { ...s, vault_id: null };
          }
        }),
      );
      setUserSecrets(enriched);
      // An open Access editor holds the row it was opened with. Re-point it at
      // the row as the chain now has it, so a condition edited elsewhere — a
      // revoke from the list beside it, another tab, the CLI — is what Save
      // starts from. Its `key` carries `updated_at`, so this remounts it.
      setAccessSecret((open) => {
        if (!open) return open;
        const same = (a: UserSecret) =>
          getAccessorLabel(a.accessor) === getAccessorLabel(open.accessor) && a.profile === open.profile;
        return enriched.find(same) ?? null;
      });
    } catch (err) {
      console.error('Failed to load user secrets:', err);
      setError(`Failed to load secrets: ${(err as Error).message}`);
      setUserSecrets([]);
    } finally {
      setLoadingSecrets(false);
    }
  }, [accountId, contractId, viewMethod]);

  // Load user secrets when connected
  useEffect(() => {
    if (isConnected && accountId) {
      loadUserSecrets();
    }
  }, [isConnected, accountId, loadUserSecrets]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleSubmitSecrets = async (formData: FormData, encryptedArray: number[]) => {
    // Same bound as the edit path: a condition the keystore would refuse to
    // judge is not worth storing, and saying so here costs no transaction.
    // THROWN, not returned: the form clears itself and reports success on a
    // resolved promise, so a silent return would wipe what the user typed and
    // announce that it was stored.
    const tooWide = chainReadRefusal(formData.access);
    if (tooWide) {
      setError(tooWide);
      throw new Error(tooWide);
    }
    try {
      // Convert encrypted array to base64 for contract
      const encryptedBase64 = Buffer.from(encryptedArray).toString('base64');

      // Build accessor based on source type
      const accessor = formData.sourceType === 'wasm_hash'
        ? { WasmHash: { hash: formData.wasmHash } }
        : formData.sourceType === 'project'
        ? { Project: { project_id: formData.projectId } }
        : { Repo: { repo: formData.repo, branch: formData.branch || null } };

      // Unified API - same method for both types
      const method = 'store_secrets';
      const estimateMethod = 'estimate_storage_cost';
      const transactionArgs = {
        accessor,
        profile: formData.profile,
        encrypted_secrets_base64: encryptedBase64,
        access: formData.access,
        // Phase 7 F2: vault scope from the form's <VaultScopeToggle>.
        // `null` ⇒ legacy / default-master (current behaviour).
        // Set ⇒ on-chain binding to a customer-owned vault, so the
        // worker's `decrypt` path knows which per-vault master to use.
        vault_id: formData.vaultId,
      };
      const estimateArgs = {
        accessor,
        profile: formData.profile,
        owner: accountId,
        encrypted_secrets_base64: encryptedBase64,
        access: formData.access,
        // Must mirror `transactionArgs.vault_id` so the cost estimate
        // includes (or excludes) the binding-storage overhead.
        vault_id: formData.vaultId,
      };

      // Estimate storage cost via viewMethod
      const estimatedCost = await viewMethod({
        contractId,
        method: estimateMethod,
        args: estimateArgs,
      });

      console.log('Estimated cost result:', estimatedCost, typeof estimatedCost);

      // estimatedCost is returned as U128 string "123456"
      if (!estimatedCost) {
        throw new Error('Failed to estimate storage cost - received null');
      }

      const costString = typeof estimatedCost === 'string' ? estimatedCost : String(estimatedCost);

      // Create function call action with exact deposit
      const action = actionCreators.functionCall(
        method,
        transactionArgs,
        BigInt('50000000000000'), // 50 TGas
        BigInt(costString) // Exact storage cost
      );

      const response = await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess(`Secrets ${editingSecret ? 'updated' : 'created'} successfully! Transaction: ${response?.transaction?.hash || 'completed'}`);
      setEditingSecret(null);

      // Reload secrets list
      setTimeout(() => {
        loadUserSecrets();
      }, 2000);
    } catch (err) {
      setError(`Failed to save secrets: ${(err as Error).message}`);
      console.error(err);
      throw err;
    }
  };

  const handleEditSecret = (secret: UserSecret) => {
    // Validate accessor exists
    if (!secret.accessor) {
      setError('Invalid secret: accessor is missing');
      return;
    }

    // Build label for confirmation
    let label: string;
    if (isRepoAccessor(secret.accessor)) {
      label = `${secret.accessor.Repo.repo}:${secret.profile}`;
    } else if (isWasmHashAccessor(secret.accessor)) {
      label = `WASM(${secret.accessor.WasmHash.hash.substring(0, 8)}...):${secret.profile}`;
    } else if (isProjectAccessor(secret.accessor)) {
      label = `Project(${secret.accessor.Project.project_id}):${secret.profile}`;
    } else {
      setError('Invalid secret: unknown accessor type');
      return;
    }

    if (!confirm(` Replace secrets for ${label}?\n\nNote: You cannot decrypt/view existing secrets - only workers can decrypt them.\nThis will completely replace the encrypted secrets with new ones.`)) {
      return;
    }
    setEditingSecret(secret);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateSecret = (secret: UserSecret) => {
    // Validate accessor exists
    if (!secret.accessor) {
      setError('Invalid secret: accessor is missing');
      return;
    }

    setUpdatingSecret(secret);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // `update_access`: the condition moves, the ciphertext stays.
  //
  // A condition is stored bytes, so the contract re-prices the row on every
  // edit. The whole estimate is attached: the deposit already held is credited
  // towards it and the excess returns in the same transaction, so widening a
  // whitelist asks only for the growth and narrowing one refunds the
  // difference. The list carries metadata only, so the row is re-read for the
  // ciphertext the price depends on.
  const sendAccess = async (secret: UserSecret, newAccess: unknown) => {
    let deposit = BigInt('0');
    try {
      const row = await viewMethod({
        contractId,
        method: 'get_secrets',
        args: { accessor: secret.accessor, profile: secret.profile, owner: accountId },
      });
      const ciphertext =
        row && typeof row === 'object' && 'encrypted_secrets' in row
          ? String((row as { encrypted_secrets: unknown }).encrypted_secrets ?? '')
          : '';
      const estimate = await viewMethod({
        contractId,
        method: 'estimate_storage_cost',
        args: {
          accessor: secret.accessor,
          profile: secret.profile,
          owner: accountId,
          encrypted_secrets_base64: ciphertext,
          access: newAccess,
          vault_id: null,
        },
      });
      deposit = BigInt(String(estimate ?? '0'));
    } catch (err) {
      // An unpriced edit is refused by the contract when it grows the row, and
      // the message says so. Failing here instead would also stop the edits
      // that need nothing — every narrowing, and every swap of equal size.
      console.error('Could not price the access change:', err);
    }
    const action = actionCreators.functionCall(
      'update_access',
      { accessor: secret.accessor, profile: secret.profile, new_access: newAccess },
      BigInt('30000000000000'), // 30 TGas
      deposit
    );
    await signAndSendTransaction({ receiverId: contractId, actions: [action] });
    setSuccess('Access updated. The secret itself was not touched.');
    setTimeout(() => loadUserSecrets(), 2000);
  };

  const handleSaveAccess = async (newAccess: unknown) => {
    if (!accessSecret) return;
    // The contract stores by this bound and the keystore judges by it, so the
    // refusal belongs here — before a wallet prompt, not as a panic after one.
    const tooWide = (chainReadRefusal(newAccess) ?? buildHashRefusal(newAccess));
    if (tooWide) {
      // The editor catches this and shows it beside the tree being edited.
      throw new Error(tooWide);
    }
    await sendAccess(accessSecret, newAccess);
    setAccessSecret(null);
  };

  // One-click revoke from the grants overview: the account leaves this secret's
  // condition, nothing else about the condition changes.
  const [revoking, setRevoking] = useState<string | null>(null);
  const handleRevoke = async (secret: UserSecret, account: string) => {
    const key = `${getAccessorLabel(secret.accessor)}/${secret.profile}:${account}`;
    setRevoking(key);
    setError(null);
    try {
      const next = withoutGrant(secret.access, account, accountId);
      // A row stored before the bounds existed can hold more than they allow.
      // Revoking from here would prompt the wallet and then panic on chain, so
      // the owner is sent to the editor, where the whole condition is visible.
      const tooWide = chainReadRefusal(next);
      if (tooWide) {
        setError(`${tooWide} Open “Access” on this secret to edit the condition as a whole.`);
        return;
      }
      await sendAccess(secret, next);
      // This revoke's condition came from the loaded list. Releasing the
      // buttons before the list catches up lets the NEXT revoke start from the
      // state before this one — which puts the account just removed back.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await loadUserSecrets();
    } catch (e) {
      setError(`Failed to revoke: ${(e as Error).message}`);
    } finally {
      setRevoking(null);
    }
  };

  // Every account this owner's secrets name, grouped by account — so a grant
  // that has outlived its agent is found here rather than remembered. A leased
  // agent's executor is the partner's wallet; its lease is not readable from
  // this page, so the expiry stored with the grant is what is shown.
  // Project rows only. A repository- or hash-bound row's whitelist is the
  // audience of an app's own credential, not a secret handed to somebody's
  // agent, and listing it here under a Revoke button would invite cutting off
  // that app's users.
  const grantRows = userSecrets
    .filter((s) => s.accessor && isProjectAccessor(s.accessor))
    .flatMap((s) => grantsOf(s.access, accountId).map((g) => ({ secret: s, ...g })));
  const grantsByAccount = new Map<string, typeof grantRows>();
  for (const row of grantRows) {
    const list = grantsByAccount.get(row.account) ?? [];
    list.push(row);
    grantsByAccount.set(row.account, list);
  }
  const ownWallet = new Map(wallets.map((w) => [w.account, w.label]));

  // Personal secrets anyone can name. Existing rows are never changed by us;
  // this is how the whitelist default reaches rows stored before it.
  const openPersonal = openPersonalRows(userSecrets);
  // An author whose apps legitimately hold AllowAll credentials sees the notice
  // once and puts it away; it is a nudge, not a gate. Per browser, best effort:
  // storage can be absent or blocked, and the page must render either way.
  const NOTICE_KEY = 'secrets.allowall-notice.dismissed';
  const [noticeDismissed, setNoticeDismissed] = useState(true);
  useEffect(() => {
    try {
      setNoticeDismissed(window.localStorage.getItem(NOTICE_KEY) === '1');
    } catch {
      setNoticeDismissed(false);
    }
  }, []);
  const dismissNotice = () => {
    setNoticeDismissed(true);
    try {
      window.localStorage.setItem(NOTICE_KEY, '1');
    } catch {
      // nothing to remember it in; it comes back next visit
    }
  };

  const handleDeleteSecret = async (secret: UserSecret) => {
    // Validate accessor exists
    if (!secret.accessor) {
      setError('Invalid secret: accessor is missing');
      return;
    }

    // Build label for confirmation
    let label: string;
    if (isRepoAccessor(secret.accessor)) {
      label = `${secret.accessor.Repo.repo}:${secret.profile}`;
    } else if (isWasmHashAccessor(secret.accessor)) {
      label = `WASM(${secret.accessor.WasmHash.hash.substring(0, 8)}...):${secret.profile}`;
    } else if (isProjectAccessor(secret.accessor)) {
      label = `Project(${secret.accessor.Project.project_id}):${secret.profile}`;
    } else {
      setError('Invalid secret: unknown accessor type');
      return;
    }

    if (!confirm(`Delete secrets for ${label}? Storage deposit will be refunded automatically.`)) {
      return;
    }

    try {
      // Unified API - same method for both types
      const args = {
        accessor: secret.accessor,
        profile: secret.profile,
      };

      const action = actionCreators.functionCall(
        'delete_secrets',
        args,
        BigInt('30000000000000'), // 30 TGas
        BigInt('0') // No deposit needed - storage deposit will be refunded automatically
      );

      await signAndSendTransaction({
        receiverId: contractId,
        actions: [action],
      });

      setSuccess('Secrets deleted successfully! Storage deposit refunded.');
      setTimeout(() => loadUserSecrets(), 2000);
    } catch (err) {
      setError(`Failed to delete: ${(err as Error).message}`);
    }
  };


  return (
 <div className="w-full">
      {/* Header */}
      <PageHeader
        title="Secrets"
        description="Create and manage encrypted secrets for your repositories."
      />

      {!isConnected && (
        <div className="mb-6">
          <RequireWallet subject="your secrets" />
        </div>
      )}

      {/* Someone else's link filled this form in. Say what signing would actually do. */}
      {fromLink && (
        <div className="mt-4 bg-destructive/10 border border-destructive/40 rounded-md p-4">
          <p className="text-sm font-semibold text-destructive-text">
            This form was pre-filled in from a link. Only continue if you would hand its owner this
            credential directly.
          </p>
          <dl className="mt-3 text-sm text-destructive-text space-y-1">
            {linkProject && (
              <div className="flex gap-2">
                <dt className="opacity-70 w-20 shrink-0">Project</dt>
                <dd className="font-mono break-all">{linkProject}</dd>
              </div>
            )}
            {linkEffectiveProfile && (
              <div className="flex gap-2">
                <dt className="opacity-70 w-20 shrink-0">Profile</dt>
                <dd className="font-mono break-all">{linkEffectiveProfile}</dd>
              </div>
            )}
            {linkName && (
              <div className="flex gap-2">
                <dt className="opacity-70 w-20 shrink-0">Secret</dt>
                <dd className="font-mono break-all">{linkName}</dd>
              </div>
            )}
          </dl>
          {linkOverwrites && (
            <p className="mt-3 text-sm font-semibold text-destructive-text">
              You already have a secret saved for this project and profile. Saving REPLACES it. A
              generated key cannot be recovered once replaced, so anything it holds — funds at its
              address, access it was granted — becomes permanently unreachable. The transaction will
              not warn you: the old storage deposit is credited back, so the amount looks like
              nothing.
            </p>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
 <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-md p-3">
 <p className="text-sm text-destructive-text">{error}</p>
        </div>
      )}

      {/* Success Display */}
      {success && (
 <div className="mt-4 bg-success/10 border border-success/30 rounded-md p-3">
 <p className="text-sm text-success-text">{success}</p>
        </div>
      )}

      {/* Create + list side-by-side on wide screens */}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
      {/* Two columns that pack independently. A row-based grid sizes every
          row to its tallest cell, so the short block leaves a hole and the
          long list below it starts past the fold. */}
        <div className="flex flex-col gap-6">
        <div>
          <SecretsForm
            isConnected={isConnected}
            accountId={accountId}
            onSubmit={handleSubmitSecrets}
            coordinatorUrl={coordinatorUrl}
            prefill={prefill}
            prefillStoredAccess={
              fromLink && !editingSecret && !updatingSecret ? linkTarget?.access : undefined
            }
            initialData={initialData}
            updateMode={updateMode}
            onUpdateComplete={() => {
              setUpdatingSecret(null);
              loadUserSecrets();
              setSuccess('Secrets updated successfully!');
            }}
            onCancelUpdate={() => setUpdatingSecret(null)}
          />

          {/* A secret that belongs to an AGENT rather than to this account. Same
              page, because it is the same question — "which credential does this
              code get" — asked for a wallet that cannot pay for its own storage. */}
   <div className="mt-6">
   <AgentSecretForm
              coordinatorUrl={coordinatorUrl}
              contractId={contractId}
              accountId={accountId}
              isConnected={isConnected}
              viewMethod={viewMethod}
              signAndSendTransaction={signAndSendTransaction}
            />
   </div>
        </div>
        {openPersonal.length > 0 && !noticeDismissed && (
          <div className="bg-warning/10 border border-warning/40 rounded-md p-4 text-sm text-warning-text flex items-start justify-between gap-4">
            <span>
              {openPersonal.length} of your project secrets admit everyone: anyone who names such a secret can
              run that project with it. Keep that for an app&rsquo;s own credential named in its manifest;
              for a personal one, narrow it with &ldquo;Access&rdquo; to yourself and the agents you hand it to.
            </span>
            <button type="button" onClick={dismissNotice} className="shrink-0 text-xs underline" title="Hide this notice in this browser">
              Dismiss
            </button>
          </div>
        )}
   <div className="bg-card-muted border border-border rounded-lg p-4">
   <h3 className="text-sm font-semibold text-foreground mb-3">
            How repo-based secrets work
          </h3>
   <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
   <strong>Create secrets</strong>: Secrets are encrypted with keystore&apos;s public key and stored in the contract
            </li>
            <li>
   <strong>Reference in execution</strong>: Use <code className="bg-card-muted px-1 py-0.5 rounded text-xs font-mono">secrets_ref: {`{profile: "production", account_id: "you.near"}`}</code>
            </li>
            <li>
   <strong>Automatic decryption</strong>: Worker fetches secrets from contract and decrypts via keystore
            </li>
            <li>
   <strong>Access validation</strong>: Keystore validates access conditions (balance checks, whitelists, etc.)
            </li>
            <li>
   <strong>WASI injection</strong>: Decrypted secrets injected as environment variables into WASM
            </li>
            <li>
   <strong>Code access</strong>: Your WASM code uses <code className="bg-card-muted px-1 py-0.5 rounded text-xs font-mono">std::env::var(&quot;API_KEY&quot;)</code>
            </li>
          </ol>

   <div className="mt-4 p-3 bg-card rounded-md border border-border">
   <h4 className="text-xs font-semibold text-foreground mb-2">Example: Request Execution with Secrets</h4>
   <pre className="text-xs text-foreground overflow-x-auto">
  {`near call outlayer.testnet request_execution '{
    "source": {
      "GitHub": {
        "repo": "https://github.com/alice/myproject",
        "commit": "main",
        "build_target": "wasm32-wasip1"
      }
    },
    "secrets_ref": {
      "profile": "production",
      "account_id": "alice.near"
    },
    "resource_limits": { ... },
    "input_data": "{}"
  }' --accountId alice.near --deposit 0.1`}
            </pre>
          </div>
        </div>
        </div>
        <div className="flex flex-col gap-6">
        {accessSecret && (
          <AccessEditor
            // The editor reads the row once, into state with no syncing
            // effect. Without a key, opening Access on a second row while the
            // first is open would keep the FIRST row's condition and save it
            // onto the second.
            key={`${getAccessorLabel(accessSecret.accessor)}/${accessSecret.profile}@${accessSecret.updated_at}`}
            secret={accessSecret}
            accountId={accountId}
            wallets={wallets}
            onSave={handleSaveAccess}
            onCancel={() => {
              setAccessSecret(null);
              setAccessFromLink(false);
            }}
            highlight={accessFromLink}
          />
        )}
        {grantsByAccount.size > 0 && (
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground">Secrets handed to other accounts</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Each account below can read the secrets listed under it, on the project those secrets are
              stored for. A grant outlives the agent&rsquo;s binding or lease unless it carries an expiry
              &mdash; revoke here what no longer has an agent behind it.
            </p>
            {/* Bounded on purpose: this list grows with every grant, and pushing
                "Your Secrets" below the fold makes the page read as if the list
                were gone. */}
            <ul className="mt-3 space-y-3 max-h-64 overflow-y-auto pr-1">
              {Array.from(grantsByAccount.entries()).map(([account, rows]) => (
                <li key={account}>
                  <div className="text-xs break-all text-foreground">
                    {/* The whole id, and one click copies it: this is the value
                        an owner pastes into an agent's configuration. */}
                    <CopyText value={account} />
                    {ownWallet.has(account) && (
                      <span className="ml-2 font-sans text-muted-foreground">your wallet {ownWallet.get(account)}</span>
                    )}
                    {!ownWallet.has(account) && /^[0-9a-f]{64}$/.test(account) && (
                      <span className="ml-2 font-sans text-muted-foreground">a wallet you do not own</span>
                    )}
                  </div>
                  <ul className="mt-1 ml-4 space-y-1">
                    {rows.map((row) => {
                      const key = `${getAccessorLabel(row.secret.accessor)}/${row.secret.profile}:${account}`;
                      return (
                        <li key={key} className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 break-all text-foreground">
                            {getAccessorLabel(row.secret.accessor)} / {row.secret.profile}
                            <span className="text-muted-foreground">
                              {' '}&middot; {row.until_ns ? `until ${nsToIsoUtc(row.until_ns)}` : 'no expiry'}
                            </span>
                          </span>
                          <button
                            type="button"
                            disabled={revoking !== null}
                            onClick={() => handleRevoke(row.secret, account)}
                            className="shrink-0 px-2 py-1 border border-destructive/40 rounded text-destructive-text bg-destructive/10 hover:bg-destructive/15 disabled:opacity-50"
                            title="update_access without this account; the encrypted value is untouched"
                          >
                            {revoking === key ? 'Revoking…' : 'Revoke'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SecretsList
          secrets={userSecrets}
          loading={loadingSecrets}
          isConnected={isConnected}
          onEdit={handleEditSecret}
          onUpdate={handleUpdateSecret}
          onDelete={handleDeleteSecret}
          onAccess={(secret) => { setAccessSecret(secret); setAccessFromLink(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          onRefresh={loadUserSecrets}
        />
        </div>
      </div>

    </div>
  );
}
