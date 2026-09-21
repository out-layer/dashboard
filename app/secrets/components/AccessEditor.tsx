'use client';

import { useEffect, useRef, useState } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import { CopyText } from '@/components/ui/copy-text';
import { isImplicitAccount, shortAccount } from '@/lib/short-account';
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
  conditionRefusal,
  callersOf,
  namedAccounts,
  predecessorNodes,
  withCallers,
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
  /** Opened by a link from another page — "grant an agent access" — rather than
   *  by the row's own button: it is then the reason the visitor is here, so it
   *  is framed and scrolled into view instead of appearing above a list. */
  highlight?: boolean;
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
 *
 * **The form is the controls; the explanations are one click away.** Most
 * visitors come to add one account and leave. Everything that explains a
 * control — who a grant names, what "direct calls only" closes, what a relaying
 * contract may do — sits behind the (i) beside that control, so the form reads
 * as three short rows. What stays in the open is only what changes the
 * decision in front of the reader: a warning about the row as it is, and the
 * condition that will be stored when it differs from the one stored now.
 */
export function AccessEditor({ secret, accountId, wallets = [], onSave, onCancel, highlight = false }: AccessEditorProps) {
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlight) frame.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);
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
  // The calling-account rule, as the screen offers it: "direct calls only"
  // names every account the row admits, plus the contracts the owner composes
  // through. `custom` is any other shape — the builder's, not this view's.
  const callers = contractTree === null ? null : callersOf(contractTree);
  const named = contractTree === null ? [] : namedAccounts(contractTree, accountId);
  const directOnly = callers !== null && !callers.custom;
  const viaContracts = directOnly ? callers.accounts.filter((a) => !named.includes(a)) : [];
  const [viaInput, setViaInput] = useState('');

  // A grant or a revocation changes WHO the row names; a "direct calls only"
  // rule names the same accounts, so it follows. The contracts named beside
  // them are the owner's own list and are carried as they are.
  const followingCallers = (tree: unknown): unknown => {
    if (!directOnly) return tree;
    return withCallers(tree, [...namedAccounts(tree, accountId), ...viaContracts]);
  };

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

  // Every edit here is made in the owner's name — the fallback a revocation
  // leaves behind, the accounts a rule follows — so none is made without one.
  const noOwner = () => {
    if (accountId) return false;
    setError('Connect the wallet that owns this secret before editing who may read it.');
    return true;
  };

  const addGrant = () => {
    const account = grantee.trim();
    if (!account || contractTree === null || noOwner()) return;
    if (account === accountId) {
      setError('That is your own account; it is the owner, not a grantee.');
      return;
    }
    if (viaContracts.includes(account)) {
      // A contract that calls on the owner's behalf is not a reader; naming it
      // as both would make its revocation silently drop it from the calling
      // list as well.
      setError(`${account} is named as a contract calls may come through; remove it there first to hand it the secret instead.`);
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
    applyContract(followingCallers(withGrant(contractTree, accountId, account, until)));
    setGrantee('');
    setGrantUntil('');
    setGrantUntilOn(false);
  };

  const revoke = (account: string) => {
    if (contractTree === null || noOwner()) return;
    applyContract(followingCallers(withoutGrant(contractTree, account, accountId)));
  };

  const setDirectOnly = (on: boolean) => {
    if (contractTree === null || noOwner()) return;
    applyContract(withCallers(contractTree, on ? named : []));
  };

  const addVia = () => {
    const account = viaInput.trim();
    if (!account || contractTree === null || !directOnly || noOwner()) return;
    if (named.includes(account) || viaContracts.includes(account)) {
      setError(`${account} is already admitted as a calling account.`);
      return;
    }
    applyContract(withCallers(contractTree, [...named, ...viaContracts, account]));
    setViaInput('');
  };

  const removeVia = (account: string) => {
    if (contractTree === null || !directOnly || noOwner()) return;
    applyContract(withCallers(contractTree, [...named, ...viaContracts.filter((a) => a !== account)]));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const tree = keptTree ?? convertAccessToContractFormat(condition);
      const refusal = conditionRefusal(tree);
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

  const storedText = formatAccessCondition(secret.access);
  const nextText = contractTree === null ? '—' : formatAccessCondition(contractTree);

  return (
 <div
      ref={frame}
      className={`bg-card rounded-lg p-4 sm:p-5 mb-6 ${highlight ? 'border-2 border-accent shadow-lg ring-4 ring-accent/15' : 'border border-info/40'}`}
    >
 <h3 className="text-base font-semibold text-foreground">
        Who may read {getAccessorLabel(secret.accessor)} / {secret.profile}
      </h3>
      {keptTree !== null && (
 <p className="mt-2 text-xs text-warning-text">
          The stored condition has a shape this page cannot display, so it is kept exactly as it is. Grants added or revoked below still apply
          to it.
        </p>
      )}

      {/* Grants */}
 <div className="mt-3">
 <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          Handed to
          <InfoHint
            text={
              <>
                <span className="block">
                  A grant names the account that <strong>pays</strong> for the calls — any NEAR account. For an agent that is its custody
                  wallet: 64 hex characters, because it is an implicit account, and not the name the agent acts as under a binding.
                </span>
                <span className="mt-2 block">
                  For an agent held under a lease, set the expiry to the lease end: the grant lapses with it and nobody has to remember to
                  revoke.
                </span>
                <span className="mt-2 block">
                  An expiry applies to the grant being added. Re-adding an account that already has one keeps the expiry it has; grants
                  already listed are not changed.
                </span>
              </>
            }
          />
        </h4>
        {callers?.custom && (
 <p className="mt-1 text-xs text-warning-text">
            This row carries a calling-account rule this view cannot extend to a grantee: a grant added here is admitted from anywhere. Edit the
            full condition to put it under that rule.
          </p>
        )}
        {isAllowAll ? (
 <p className="mt-1 text-xs text-warning-text">
            Everyone: anyone who names this secret can run the project with it. Adding a grant narrows it to you and the accounts you name.
          </p>
        ) : grants.length === 0 ? (
 <p className="mt-1 text-xs text-muted-foreground">Nobody besides you.</p>
        ) : (
 <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {grants.map((g) => (
              <li key={`${g.account}:${g.until_ns ?? ''}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
 <div className="min-w-0">
                  <CopyText
                    value={g.account}
                    display={`${isImplicitAccount(g.account) ? '🤖 ' : ''}${shortAccount(g.account)}`}
                    className="text-foreground"
                  />
 <span className="ml-2 text-muted-foreground">
                    {ownWallet.has(g.account) ? `your wallet ${ownWallet.get(g.account)} · ` : ''}
                    {g.until_ns ? `until ${nsToIsoUtc(g.until_ns)}` : 'no expiry'}
                  </span>
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

        {/* One row. Unticked, "Until" is a single line on the row's baseline;
            ticked, it becomes a label over its date control, like the field
            beside it. Nothing is said about a grant with no date: the absence of
            a date already says it. */}
 <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
 <label className="block text-xs font-medium text-foreground mb-1">Grant to</label>
            <input
              type="text"
              list={wallets.length ? 'grantee-wallets' : undefined}
              value={grantee}
              onChange={(e) => setGrantee(e.target.value)}
              placeholder="an agent’s wallet, or any NEAR account"
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
            <label className={`flex items-center gap-2 text-xs font-medium text-foreground ${grantUntilOn ? 'mb-1' : 'py-2.5'}`}>
              <input
                type="checkbox"
                checked={grantUntilOn}
                onChange={(e) => setGrantUntilOn(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              Until (UTC)
            </label>
            {grantUntilOn && (
              <input
                type="datetime-local"
                step="1"
                aria-label="Grant expiry, UTC"
                value={grantUntil}
                onChange={(e) => setGrantUntil(e.target.value)}
 className="block rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
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
      </div>

      {/* Who may CALL: the contract in between, or none */}
 <div className="mt-3">
        {callers?.custom ? (
 <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Called from:</span> a calling-account rule this view cannot summarise —{' '}
            {predecessorNodes(contractTree).map(formatAccessCondition).join('; ')}. Edit it under Full condition.
          </p>
        ) : isAllowAll || named.length === 0 ? null : (
          <>
            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={directOnly}
                  onChange={(e) => setDirectOnly(e.target.checked)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                Direct calls only
              </label>
              <InfoHint
                text={
                  <>
                    <span className="block">
                      A call is admitted only when the account that calls OutLayer is one this row names — you and the grantees — with no
                      other contract in between.
                    </span>
                    <span className="mt-2 block">
                      Without it, a contract you sign any transaction to can relay a call naming this secret into its project, under your
                      name. With it, a DAO or a router calling on your behalf is refused unless you name it.
                    </span>
                    <span className="mt-2 block">
                      A grantee that is itself a contract is on the list, and may relay. Over HTTPS nothing relays a call: the payment
                      key&rsquo;s owner is judged, as always.
                    </span>
                  </>
                }
              />
            </div>
            {directOnly && (
 <div className="mt-2 space-y-2">
                {viaContracts.length > 0 && (
 <ul className="divide-y divide-border rounded-md border border-border">
                    {viaContracts.map((a) => (
                      <li key={a} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                        <span className="min-w-0">
                          <CopyText value={a} className="text-foreground" />
                          <span className="ml-2 text-muted-foreground">may relay</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeVia(a)}
 className="shrink-0 px-2 py-1 border border-destructive/40 rounded text-destructive-text bg-destructive/10 hover:bg-destructive/15"
                          title="Calls through this contract will be refused"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
 <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
 <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-foreground">
                      Also through these contracts
                      <InfoHint
                        text={
                          <>
                            <span className="block">
                              A contract named here is trusted by your choice: it may relay a call naming this secret with any input it likes.
                              Name contracts that check who calls them.
                            </span>
                            <span className="mt-2 block">
                              A grant that lapses on its own stays on this list until you revoke it: the date ends what it may read, not what
                              it may relay.
                            </span>
                          </>
                        }
                      />
                    </label>
                    <input
                      type="text"
                      value={viaInput}
                      onChange={(e) => setViaInput(e.target.value)}
                      placeholder="a DAO or a router — dao.sputnik-dao.near"
 className="block w-full rounded-md border border-border-strong px-3 py-2 text-sm font-mono outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addVia}
                    disabled={!viaInput.trim()}
 className="px-3 py-2 text-sm font-medium rounded border border-info/40 text-info bg-info/10 hover:bg-info/15 disabled:opacity-50"
                  >
                    Add contract
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* The tree itself */}
 <details className="mt-3">
 <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
          Full condition — patterns, balances, DAO roles, NOT
        </summary>
 <p className="mt-2 text-xs text-muted-foreground">Stored now: {storedText}</p>
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
            <AccessConditionBuilder condition={condition} onChange={setCondition} accountId={accountId} />
          )}
        </div>
      </details>
      {/* Shown only once it says something: before any edit it would repeat the
          list above, and afterwards it is the one line worth reading before Save. */}
      {nextText !== storedText && (
 <p className="mt-3 rounded border border-border bg-card-muted px-3 py-2 text-xs text-foreground">
          <span className="font-medium">Will be stored:</span> {nextText}
        </p>
      )}

      {error && (
 <p className="mt-2 text-sm text-destructive-text">{error}</p>
      )}
 <div className="mt-3 flex gap-2">
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
