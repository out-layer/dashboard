'use client';

import { useState } from 'react';
import { AccessConditionBuilder } from './AccessConditionBuilder';
import { AccessCondition, UserSecret, getAccessorLabel } from './types';
import {
  convertAccessFromContractFormat,
  convertAccessToContractFormat,
  formatAccessCondition,
  grantsOf,
  localInputToNs,
  nsToIsoUtc,
  nsToLocalInput,
  withGrant,
  withoutGrant,
  chainReadRefusal,
  buildHashRefusal,
} from './utils';

/** A custody wallet the connected account owns, offered as a grantee. */
export interface GranteeWallet {
  /** The implicit account — what pays for the wallet's calls and what a grant names. */
  account: string;
  /** How the wallet page shows it. */
  label: string;
}

interface AccessEditorProps {
  secret: UserSecret;
  accountId: string | null;
  wallets?: GranteeWallet[];
  onSave: (newAccess: unknown) => Promise<void>;
  onCancel: () => void;
}

/**
 * Who may read one stored secret. Saves through the contract's `update_access`,
 * which changes the condition and nothing else — the ciphertext stays, so no
 * value is re-entered and no generated key is lost.
 *
 * The top half is the grant view: each account the condition names, with its
 * expiry, and a row to hand the secret to one more — a wallet of yours picked
 * from a list, or any executor account pasted in, until a date or for good. A
 * leased agent's executor is the partner's wallet, so its lease end is not
 * something this page can read; the date is typed from the lease. The builder
 * underneath edits the same tree for anything the grant view does not express.
 */
export function AccessEditor({ secret, accountId, wallets = [], onSave, onCancel }: AccessEditorProps) {
  const stored: AccessCondition | null = (() => {
    try {
      return convertAccessFromContractFormat(secret.access);
    } catch {
      return null;
    }
  })();
  const [condition, setCondition] = useState<AccessCondition>(
    stored ?? { type: 'Whitelist', accounts: accountId ? [accountId] : [] }
  );
  // A condition this build cannot render is KEPT, never replaced by the default
  // above. Replacing it is how an older page un-does a rule it simply does not
  // know — a build lock stored by a newer one, say — turning a narrowing screen
  // into the thing that opened the row. Held verbatim and saved verbatim unless
  // the user asks for a replacement.
  const [keptTree, setKeptTree] = useState<unknown | null>(stored === null ? secret.access : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantee, setGrantee] = useState('');
  const [grantUntil, setGrantUntil] = useState('');
  // The date is OFF unless it is asked for. A field that is always live reads
  // as one that must be filled in, and a value left in a hidden field must
  // never reach the grant.
  const [grantUntilOn, setGrantUntilOn] = useState(false);

  // The grant view reads and writes the contract shape; the builder keeps the
  // UI shape. One tree, two views.
  const contractTree = (() => {
    if (keptTree !== null) return keptTree;
    try {
      return convertAccessToContractFormat(condition);
    } catch {
      return null;
    }
  })();
  const grants = contractTree === null ? [] : grantsOf(contractTree, accountId);
  const isAllowAll = condition.type === 'AllowAll';
  const ownWallet = new Map(wallets.map((w) => [w.account, w.label]));

  const applyContract = (tree: unknown) => {
    try {
      setCondition(convertAccessFromContractFormat(tree));
      setKeptTree(null);
      setError(null);
    } catch (e) {
      // A tree this build cannot render is carried on verbatim rather than
      // refused: the grant view edited it correctly, and what it cannot do is
      // DISPLAY the result. Refusing here would make an unknown leaf enough to
      // block a revocation.
      setKeptTree(tree);
      setError(null);
    }
  };

  const addGrant = () => {
    const account = grantee.trim();
    if (!account || contractTree === null) return;
    if (account === accountId) {
      setError('That is your own account; it is the owner, not a grantee.');
      return;
    }
    if (grantUntilOn && !grantUntil) {
      setError('Pick a date, or untick “Until” for a grant that does not lapse on its own.');
      return;
    }
    // Re-granting an account replaces its branch, so a grant that already has
    // an expiry must not lose it just because this form was not asked for one.
    const existing = grants.find((g) => g.account === account);
    const until = grantUntilOn ? localInputToNs(grantUntil) : existing?.until_ns ?? null;
    if (grantUntilOn && until === null) {
      setError('The expiry is not a readable date.');
      return;
    }
    applyContract(withGrant(contractTree, accountId, account, until));
    setGrantee('');
    setGrantUntil('');
    setGrantUntilOn(false);
  };

  const revoke = (account: string) => {
    if (contractTree === null) return;
    applyContract(withoutGrant(contractTree, account, accountId));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const tree = keptTree ?? convertAccessToContractFormat(condition);
      const refusal = chainReadRefusal(tree) ?? buildHashRefusal(tree);
      if (refusal) {
        setError(refusal);
        return;
      }
      await onSave(tree);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
 <div className="bg-card border border-info/40 rounded-lg p-4 sm:p-6 mb-6">
 <h3 className="text-base font-semibold text-foreground">
        Who may read {getAccessorLabel(secret.accessor)} / {secret.profile}
      </h3>
 <p className="mt-1 text-xs text-muted-foreground">
        Stored now: {formatAccessCondition(secret.access)}
      </p>
      {keptTree !== null && (
 <p className="mt-2 text-xs text-warning-text">
          The stored condition has a shape this page cannot display, so it is kept exactly as it is.
          Grants added or revoked below still apply to it, and Save stores it with those changes and
          nothing else.
        </p>
      )}

      {/* Grants */}
 <div className="mt-4">
 <h4 className="text-sm font-medium text-foreground">Handed to</h4>
        {isAllowAll ? (
 <p className="mt-1 text-xs text-warning-text">
            Everyone: anyone who names this secret can run the project with it. Adding a grant below
            narrows it to you and the accounts you name.
          </p>
        ) : grants.length === 0 ? (
 <p className="mt-1 text-xs text-muted-foreground">Nobody besides you.</p>
        ) : (
 <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {grants.map((g) => (
              <li key={`${g.account}:${g.until_ns ?? ''}`} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
 <div className="min-w-0">
 <div className="font-mono break-all text-foreground">{g.account}</div>
 <div className="text-muted-foreground">
                    {ownWallet.has(g.account) ? `your wallet ${ownWallet.get(g.account)} · ` : ''}
                    {g.until_ns ? `until ${nsToIsoUtc(g.until_ns)}` : 'no expiry'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(g.account)}
 className="shrink-0 px-2 py-1 border border-destructive/40 rounded text-destructive-text bg-destructive/10 hover:bg-destructive/15"
                  title="Remove this account from the condition; the encrypted value is untouched"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}

 <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
 <label className="block text-xs font-medium text-foreground mb-1">Grant to</label>
            <input
              type="text"
              list={wallets.length ? 'grantee-wallets' : undefined}
              value={grantee}
              onChange={(e) => setGrantee(e.target.value)}
              placeholder="the account that runs the project — a wallet of yours, or any NEAR account"
 className="block w-full rounded-md border border-border-strong px-3 py-2 text-sm font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent"
            />
            {wallets.length > 0 && (
              <datalist id="grantee-wallets">
                {wallets.map((w) => (
                  <option key={w.account} value={w.account}>{w.label}</option>
                ))}
              </datalist>
            )}
          </div>
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-foreground mb-1">
              <input
                type="checkbox"
                checked={grantUntilOn}
                onChange={(e) => setGrantUntilOn(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              Until (UTC)
            </label>
            {grantUntilOn ? (
              <input
                type="datetime-local"
                step="1"
                aria-label="Grant expiry, UTC"
                value={grantUntil}
                onChange={(e) => setGrantUntil(e.target.value)}
 className="block rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            ) : (
              <p className="text-xs text-muted-foreground py-2">the grant does not lapse on its own</p>
            )}
          </div>
          <button
            type="button"
            onClick={addGrant}
            disabled={!grantee.trim()}
 className="px-3 py-2 text-sm font-medium rounded border border-info/40 text-info bg-info/10 hover:bg-info/15 disabled:opacity-50"
          >
            Add grant
          </button>
        </div>
 <p className="mt-2 text-xs text-muted-foreground">
          A grant names the account that <strong>pays</strong> for the calls — any NEAR account will
          do. For an agent, that is its custody wallet, whose id is 64 hex characters because it is
          an implicit account, and not the name the agent acts as under a binding. For an agent you
          hold under a lease, set the expiry to the lease end: the grant lapses with it and nobody
          has to remember to revoke. An expiry set here applies to the grant being added; re-adding
          an account that already has one keeps the expiry it has, and grants already listed are not
          changed.
        </p>
      </div>

      {/* The tree itself */}
 <details className="mt-4">
 <summary className="cursor-pointer text-sm font-medium text-foreground">Full condition</summary>
 <p className="mt-2 text-xs text-muted-foreground">
          The same condition, as the contract stores it — for anything the grant view does not
          express: patterns, balances, DAO roles, NOT.
        </p>
 <div className="mt-2">
          {keptTree !== null ? (
 <div className="p-4 bg-card-muted rounded-md border border-border-strong">
 <p className="text-sm text-foreground">
                This condition has a shape this page cannot display, so it is kept exactly as it is.
                Grants added or revoked above still apply to it.
              </p>
              <button
                type="button"
                onClick={() => {
                  setKeptTree(null);
                  setCondition({ type: 'Whitelist', accounts: accountId ? [accountId] : [] });
                }}
 className="mt-2 text-xs text-accent-text underline"
              >
                Replace it with a new condition instead
              </button>
            </div>
          ) : (
            <AccessConditionBuilder condition={condition} onChange={setCondition} />
          )}
        </div>
      </details>
 <p className="mt-3 text-xs text-muted-foreground">
        Will be stored: {contractTree === null ? '—' : formatAccessCondition(contractTree)}
      </p>

      {error && (
 <p className="mt-2 text-sm text-destructive-text">{error}</p>
      )}
 <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
 className="px-4 py-2 text-sm font-medium rounded bg-accent text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save access'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
 className="px-4 py-2 text-sm font-medium rounded border border-border text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
