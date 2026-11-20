'use client';

import { useState, type ReactNode } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import {
  BASE_TRANSACTION_TYPES,
  toggledTransactionTypes,
  addressList,
  addressProblem,
  effectiveTransactionTypes,
  sameAddress,
  type PolicyForm,
} from '@/lib/wallet-policy';
import { AuthorizedKeysSection } from './AuthorizedKeysSection';
import { RefundAddressesSection } from './RefundAddressesSection';
import { TokenLimitsSection, type PolicyToken } from './TokenLimitsSection';

const FIELD =
  'w-full max-w-xl rounded-md border border-border-strong px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent';

export interface WalletPolicyFormProps {
  policyForm: PolicyForm;
  onChange: (form: PolicyForm) => void;
  /** The connected owner's account and the wallet's own, to name them in the address list. */
  ownerAccount?: string | null;
  walletAccount?: string | null;
  /** The wallet's token catalog, for the limit rows; `null` while unread. */
  tokens: PolicyToken[] | null;
  apiKeyHash?: string;
  knownKeyHashes?: Map<string, string>;
  onSaveKey?: (apiKey: string) => void;
  /** The "When must it ask you first?" section: its state is the page's. */
  approval: ReactNode;
  /** The raw JSON editor, in a fold of its own under the form. */
  jsonEditor: ReactNode;
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong text-[11px] tabular-nums text-muted-foreground">
          {step}
        </span>
        {title}
        {hint && <InfoHint text={hint} />}
      </h2>
      {children}
    </section>
  );
}

/**
 * One capability: a switch, its name, and the full account of what it opens
 * behind the (i). Switched on, it says its consequence in one plain line —
 * the summary beside the form names it too.
 */
function Capability({
  checked,
  onChange,
  title,
  about,
  consequence,
  hint,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  title: string;
  about: string;
  consequence: string;
  hint: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={title}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            {title}
            <InfoHint text={hint} />
          </p>
          <p className="text-xs text-muted-foreground">{checked ? consequence : about}</p>
          {checked && children && <div className="mt-2 space-y-2">{children}</div>}
        </div>
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<(typeof BASE_TRANSACTION_TYPES)[number], { label: string; about: string }> = {
  transfer: { label: 'Send NEAR', about: 'A native NEAR transfer from the wallet’s account.' },
  intents_withdraw: { label: 'Withdraw on NEAR', about: 'Tokens leave the wallet’s intents balance to an account on NEAR.' },
  intents_transfer: { label: 'Pay inside NEAR Intents', about: 'Tokens move to another account’s intents balance.' },
  call: { label: 'Call contracts', about: 'Any method of a contract on the address list, with any arguments — and depositing the wallet’s own NEAR into intents.' },
  delete: { label: 'Delete the wallet account', about: 'The account is removed and its NEAR goes to a listed beneficiary.' },
};

export function WalletPolicyForm({
  policyForm,
  onChange,
  ownerAccount,
  walletAccount,
  tokens,
  apiKeyHash,
  knownKeyHashes,
  onSaveKey,
  approval,
  jsonEditor,
}: WalletPolicyFormProps) {
  const update = (patch: Partial<PolicyForm>) => onChange({ ...policyForm, ...patch });
  const [newAddress, setNewAddress] = useState('');
  const [addressError, setAddressError] = useState<string | null>(null);

  const list = addressList(policyForm);
  const addAddress = () => {
    const address = newAddress.trim();
    if (!address) return;
    const problem = addressProblem(address);
    if (problem) {
      setAddressError(problem);
      return;
    }
    setAddressError(null);
    setNewAddress('');
    if (!list.some((a) => sameAddress(a, address))) update({ addresses: [...list, address].join(', ') });
  };
  const tagOf = (address: string): string | null =>
    ownerAccount && sameAddress(address, ownerAccount) ? 'you' : walletAccount && sameAddress(address, walletAccount) ? 'this wallet' : null;

  const types = policyForm.transaction_types.split(',').map((t) => t.trim()).filter(Boolean);
  const hasTypeRule = policyForm.transaction_types.trim() !== '';
  const toggleType = (type: string) => update({ transaction_types: toggledTransactionTypes(policyForm.transaction_types, type) });
  const effective = effectiveTransactionTypes(policyForm);

  const advancedChanged = [
    policyForm.raw_sign_enabled,
    policyForm.intents_call_enabled,
    policyForm.sign_message_allowed_recipients.trim() !== '',
    !policyForm.only_limited_tokens && policyForm.allowed_tokens.trim() !== '' && policyForm.allowed_tokens.trim() !== '*',
    policyForm.hourly_limit !== '' || policyForm.monthly_limit !== '',
    policyForm.allowed_hours_start !== '' || policyForm.allowed_days !== '',
    policyForm.max_per_hour !== '',
    policyForm.webhook_url !== '',
    policyForm.refund_addresses.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-8">
      <div className="grid items-start gap-x-10 gap-y-8 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        <Section
          step={1}
          title="Where may money go?"
          hint="Every transfer, withdrawal and contract call is checked against this list before the wallet signs it. An address is an account on NEAR or an address on another chain; the same list covers all of them."
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {([
              { mode: 'whitelist', label: 'Only these addresses' },
              { mode: 'none', label: 'Any address' },
              { mode: 'blacklist', label: 'Any but these' },
            ] as const).map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={policyForm.address_mode === mode}
                onClick={() => update({ address_mode: mode })}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  policyForm.address_mode === mode
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-border-strong text-foreground hover:border-accent hover:text-accent-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {policyForm.address_mode === 'none' ? (
            <p className="text-xs text-muted-foreground">The wallet pays any address, within the limits.</p>
          ) : (
            <>
              {list.length > 0 && (
                <ul className="mb-2 divide-y divide-border rounded-md border border-border">
                  {list.map((address) => (
                    <li key={address} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 break-all font-mono text-xs text-foreground">
                        {address}
                        {tagOf(address) && (
                          <span className="ml-2 rounded border border-border px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">
                            {tagOf(address)}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => update({ addresses: list.filter((a) => a !== address).join(', ') })}
                        className="shrink-0 text-xs text-muted-foreground hover:text-destructive-text"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {policyForm.address_mode === 'whitelist' && list.length === 0 && (
                <p className="mb-2 text-xs text-destructive-text">
                  The list is empty: the wallet can pay no one. Add an address, or choose &quot;Any address&quot;.
                </p>
              )}
              <div className="flex max-w-xl gap-2">
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAddress();
                    }
                  }}
                  aria-label="Address to add"
                  placeholder="alice.near or 0x…"
                  spellCheck={false}
                  className={`${FIELD} font-mono`}
                />
                <button
                  type="button"
                  onClick={addAddress}
                  className="shrink-0 rounded-md border border-border-strong px-3 py-2 text-sm text-foreground hover:border-accent hover:text-accent-text"
                >
                  Add
                </button>
              </div>
              {addressError && <p className="mt-1 text-xs text-destructive-text">{addressError}</p>}
              {policyForm.address_mode === 'whitelist' && (
                <p className="mt-2 text-xs text-faint-foreground">
                  List people and services you pay, not contracts: a listed contract can be called with any arguments once
                  contract calls are on.
                </p>
              )}
            </>
          )}
        </Section>

        <Section
          step={2}
          title="When must it ask you first?"
          hint="A second factor for the agent's money: the agent prepares the operation, and it runs only after you approve it with your NEAR account on the Approvals page. It is chosen per kind of operation, not per amount: a kind you tick always waits, whatever the sum."
        >
          {approval}
        </Section>

        <Section
          step={3}
          title="How much?"
          hint="A limit caps one token. Per transaction is checked by the enclave that holds the keys; the daily and other windows are counted by the service across all of the wallet's keys, so a new key does not reset them."
        >
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">NEAR</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['per_transaction_limit', 'Per transaction'],
                ['daily_limit', 'Daily'],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${label} limit of NEAR`}
                    value={policyForm[field]}
                    onChange={(e) => update({ [field]: e.target.value })}
                    placeholder="no limit"
                    className={FIELD}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <TokenLimitsSection
              rows={policyForm.token_limits}
              onChange={(token_limits) => update({ token_limits })}
              tokens={tokens}
            />
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={policyForm.only_limited_tokens}
              onChange={(e) => update({ only_limited_tokens: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-accent"
            />
            <span>
              Only NEAR and the tokens above may move
              <span className="block text-xs text-muted-foreground">
                {policyForm.only_limited_tokens
                  ? 'Any other token is refused.'
                  : 'Off: a token without a row moves with no limit.'}
              </span>
            </span>
          </label>
        </Section>

        <Section
          step={4}
          title="What else may it do?"
          hint="Everything here is off until you switch it on. Sending to the listed addresses needs none of it."
        >
          <div className="rounded-lg border border-border px-3">
            <Capability
              checked={policyForm.cross_chain_withdraw_enabled}
              onChange={(on) => update({ cross_chain_withdraw_enabled: on })}
              title="Send to other chains"
              about="Off: money leaves only to accounts on NEAR."
              consequence="Pays a listed address on Ethereum, Base, Solana, Bitcoin and the other supported chains."
              hint={
                <>
                  A cross-chain send is a swap and a bridge through 1Click and cannot be reversed. The address list and the
                  limits apply to it. The route is built by the service after the wallet agrees to the amount and the
                  address, so the limit holds as long as the service is honest. To ask for your approval on each one, tick
                  &quot;Send to other chains&quot; under &quot;When must it ask you first?&quot;.
                </>
              }
            />
            <Capability
              checked={policyForm.swap_enabled}
              onChange={(on) => update({ swap_enabled: on })}
              title="Swap tokens"
              about="Off: the wallet holds what it receives."
              consequence="Exchanges one token of the wallet for another; the result stays in the wallet."
              hint={
                <>
                  A swap runs through 1Click: the quote, route and deposit address come from the service and are not bound
                  to this policy, so enabling it trusts the service with the balance of the token being sold. The limit of
                  that token applies to what is sold.
                </>
              }
            />
            <Capability
              checked={policyForm.limit_order_enabled}
              onChange={(on) => update({ limit_order_enabled: on })}
              title="Limit orders"
              about="Off: no order rests at a price."
              consequence="Rests a swap at a price; it pays out to a listed address, up to 7 days later, with no further signature."
              hint={
                <>
                  The wallet authorises the order once. An order priced through the market fills at once, so it is held to
                  the address list and the limits like a withdrawal. Freezing the wallet stops new orders but does not
                  cancel resting ones: cancel them through the API (cancel-all works on a frozen wallet). Enabling swaps
                  or other chains does not enable it.
                </>
              }
            />
            <Capability
              checked={policyForm.payment_check_enabled}
              onChange={(on) => update({ payment_check_enabled: on })}
              title="Payment links"
              about="Off: the wallet pays addresses, not links."
              consequence="Locks money behind a link that anyone holding it can claim: the address list does not apply."
              hint={
                <>
                  A payment link moves funds into an escrow that any holder of the link claims, whoever they are. The
                  transfer is built by the service, so the per-transaction limit holds as long as the service is honest.
                  Enable it for an agent that pays other agents; leave it off for one that should only pay you.
                </>
              }
            />
            <Capability
              checked={policyForm.confidential_enabled}
              onChange={(on) => update({ confidential_enabled: on })}
              title="Confidential balances"
              about="Off: balances and transfers are public."
              consequence="Shields, transfers and withdraws on the confidential shard of NEAR Intents."
              hint={
                <>
                  Confidential flows are built by the service after the wallet agrees to the amount, and are not bound to
                  this policy beyond it: enabling them trusts the service with the balance of the token involved. A
                  confidential transfer names its recipient, which is checked against the address list.
                </>
              }
            />
            <Capability
              checked={policyForm.evm_sign_enabled}
              onChange={(on) => update({ evm_sign_enabled: on, evm_sign_raw_tx: on ? policyForm.evm_sign_raw_tx : false })}
              title="Sign on EVM chains"
              about="Off: the wallet signs nothing on Ethereum-family chains."
              consequence="Signs messages and typed data with the wallet’s EVM key: full authority over what that address holds."
              hint={
                <>
                  An EIP-712 signature moves funds by itself (EIP-3009 is a transfer, EIP-2612 an approval), to any
                  address: the address list and the limits do not apply. The exposure is what sits on the wallet&apos;s EVM
                  address; the balance inside NEAR Intents is never reached by an EVM signature. Keep that address&apos;s
                  balance small.
                </>
              }
            >
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={policyForm.evm_sign_raw_tx}
                  onChange={(e) => update({ evm_sign_raw_tx: e.target.checked })}
                  className="mt-0.5 h-3.5 w-3.5 accent-accent"
                />
                Also sign raw transactions: any contract call, any native transfer
              </label>
            </Capability>
            <Capability
              checked={policyForm.solana_sign_enabled}
              onChange={(on) => update({ solana_sign_enabled: on, solana_sign_raw_tx: on ? policyForm.solana_sign_raw_tx : false })}
              title="Sign on Solana"
              about="Off: the wallet signs nothing on Solana."
              consequence="Signs messages with the wallet’s Solana key."
              hint={
                <>
                  The base switch covers messages only: the enclave refuses a &quot;message&quot; whose bytes parse as a
                  transaction. Signing transactions is authority over whatever the wallet&apos;s Solana address holds, to
                  any recipient; keep that balance small.
                </>
              }
            >
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={policyForm.solana_sign_raw_tx}
                  onChange={(e) => update({ solana_sign_raw_tx: e.target.checked })}
                  className="mt-0.5 h-3.5 w-3.5 accent-accent"
                />
                Also sign transactions: any instruction, signed blind
              </label>
            </Capability>
          </div>
        </Section>

        <Section
          step={5}
          title="Which keys run the wallet?"
          hint="The API keys the policy names are the only ones that work once it is stored. The key you are using is always named."
        >
          <AuthorizedKeysSection
            additionalKeyHashes={policyForm.additional_key_hashes}
            onChangeHashes={(hashes) => update({ additional_key_hashes: hashes })}
            apiKeyHash={apiKeyHash}
            knownKeyHashes={knownKeyHashes}
            onSaveKey={onSaveKey}
          />
        </Section>
      </div>

      <details className="rounded-lg border border-border">
        <summary className="px-4 py-3 text-sm font-semibold text-foreground">
          Advanced{advancedChanged > 0 ? ` · ${advancedChanged} set` : ''}
        </summary>
        <div className="grid items-start gap-x-10 gap-y-8 border-t border-border p-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Kinds of operation
              <InfoHint text="The basic operations the wallet may sign. Swaps, other chains, limit orders, payment links and confidential flows follow their own switches above." />
            </h3>
            <label className="mb-2 flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={!hasTypeRule}
                onChange={(e) => update({ transaction_types: e.target.checked ? '' : BASE_TRANSACTION_TYPES.filter((t) => t !== 'delete').join(',') })}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>
                No rule: every kind is permitted
                <span className="block text-xs text-muted-foreground">Kinds added later are permitted too.</span>
              </span>
            </label>
            {hasTypeRule && (
              <div className="space-y-2">
                {BASE_TRANSACTION_TYPES.map((type) => (
                  <label key={type} className="flex items-start gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={types.includes(type)}
                      onChange={() => toggleType(type)}
                      className="mt-0.5 h-4 w-4 accent-accent"
                    />
                    <span>
                      {TYPE_LABELS[type].label}
                      <span className="block text-xs text-muted-foreground">{TYPE_LABELS[type].about}</span>
                    </span>
                  </label>
                ))}
                {effective?.length === 0 && (
                  <p className="text-xs text-destructive-text">No kind of operation is permitted: the wallet can do nothing.</p>
                )}
                {types.filter((t) => !(BASE_TRANSACTION_TYPES as readonly string[]).includes(t) && effective?.includes(t)).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Also permitted, as stored:{' '}
                    <span className="font-mono">
                      {types.filter((t) => !(BASE_TRANSACTION_TYPES as readonly string[]).includes(t) && effective?.includes(t)).join(', ')}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">More limit windows for NEAR</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['hourly_limit', 'Hourly'],
                ['monthly_limit', 'Monthly'],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={policyForm[field]}
                    onChange={(e) => update({ [field]: e.target.value })}
                    placeholder="no limit"
                    className={FIELD}
                  />
                </div>
              ))}
            </div>
            <label className="mb-1 mt-4 block text-sm font-medium text-foreground">Operations per hour</label>
            <input
              type="number"
              min="1"
              value={policyForm.max_per_hour}
              onChange={(e) => update({ max_per_hour: e.target.value })}
              placeholder="no limit"
              className={FIELD}
            />
            <p className="mt-1 text-xs text-faint-foreground">Counts every kind of operation, deposits and swaps included.</p>

            {!policyForm.only_limited_tokens && (
              <>
                <label className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-medium text-foreground">
                  Allowed tokens
                  <InfoHint text="A list of token keys the wallet may move: native, nep141:<contract>. * permits every token. The switch under the limits writes this list for you from the limit rows." />
                </label>
                <input
                  type="text"
                  value={policyForm.allowed_tokens}
                  onChange={(e) => update({ allowed_tokens: e.target.value })}
                  placeholder="* or native, nep141:…"
                  spellCheck={false}
                  className={`${FIELD} font-mono`}
                />
              </>
            )}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
              When
              <InfoHint text="Hours and days in UTC when the wallet signs. Outside them every operation is refused." />
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">From hour (0–23)</label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={policyForm.allowed_hours_start}
                  onChange={(e) => update({ allowed_hours_start: e.target.value })}
                  placeholder="any"
                  className={FIELD}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">To hour (0–24)</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={policyForm.allowed_hours_end}
                  onChange={(e) => update({ allowed_hours_end: e.target.value })}
                  placeholder="any"
                  className={FIELD}
                />
              </div>
            </div>
            <label className="mb-1 mt-3 block text-xs font-medium text-muted-foreground">Days (1 = Monday … 7 = Sunday)</label>
            <input
              type="text"
              value={policyForm.allowed_days}
              onChange={(e) => update({ allowed_days: e.target.value })}
              placeholder="any, or 1,2,3,4,5"
              className={FIELD}
            />

            <label className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-medium text-foreground">
              Webhook URL
              <InfoHint text="POST notifications on approval_needed, approval_received and request_completed. HTTPS only; each request carries an HMAC-SHA256 signature; a failed delivery is retried up to 3 times." />
            </label>
            <input
              type="text"
              value={policyForm.webhook_url}
              onChange={(e) => update({ webhook_url: e.target.value })}
              placeholder="https://…"
              spellCheck={false}
              className={FIELD}
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Signing outside the policy</h3>
            <div className="rounded-lg border border-border px-3">
              <Capability
                checked={policyForm.raw_sign_enabled}
                onChange={(on) => update({ raw_sign_enabled: on })}
                title="Raw payloads"
                about="Off: the wallet signs only operations it can read."
                consequence="Signs raw transactions on the chains below, outside the address list and the limits."
                hint={
                  <>
                    Lets the agent — and the service, were it compromised — sign raw transactions on the enabled chains,
                    bypassing the transfer, call and limit rules. Leaving the chains empty allows every chain{' '}
                    <strong>except NEAR</strong>. NEAR is signed only when you list <code>near</code>: the NEAR key is the
                    wallet&apos;s transaction key, so a raw NEAR signature is any transaction — it can move funds outside
                    this policy and hand the wallet&apos;s intents account to another key.
                  </>
                }
              >
                <input
                  type="text"
                  value={policyForm.raw_sign_chains}
                  onChange={(e) => update({ raw_sign_chains: e.target.value })}
                  aria-label="Chains for raw signing"
                  placeholder="solana, … (empty: every chain but near)"
                  className={FIELD}
                />
                {policyForm.raw_sign_chains.split(',').some((c) => c.trim().toLowerCase() === 'near') && (
                  <p className="flex items-start gap-1.5 text-xs text-warning-text">
                    <WarningIcon />
                    With near listed, a raw signature is any NEAR transaction of this wallet.
                  </p>
                )}
                <label className="flex items-start gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={policyForm.raw_sign_requires_approval}
                    onChange={(e) => update({ raw_sign_requires_approval: e.target.checked })}
                    className="mt-0.5 h-3.5 w-3.5 accent-accent"
                  />
                  Each raw signature waits for the approvers
                </label>
              </Capability>
              <Capability
                checked={policyForm.intents_call_enabled}
                onChange={(on) => update({ intents_call_enabled: on })}
                title="Direct calls to NEAR Intents"
                about="Off: deposits, withdrawals, transfers and swaps use their own operations and do not need it."
                consequence="The agent may call intents.near as the wallet’s account."
                hint={
                  <>
                    This hands the agent the wallet&apos;s intents account. The contract treats a call from the
                    wallet&apos;s own account as its owner: the agent can add a key of its own that signs for the intents
                    account for good — turning this off later, freezing the wallet or locking the policy does not remove
                    that key — and move any intents balance past the limits. It works only while contract calls are
                    permitted.
                  </>
                }
              >
                <p className="flex items-start gap-1.5 text-xs text-warning-text">
                  <WarningIcon />
                  A key added this way outlives every later change to this policy.
                </p>
              </Capability>
            </div>

            <label className="mb-1 mt-4 flex items-center gap-1.5 text-sm font-medium text-foreground">
              Sign-in messages (NEP-413): allowed recipients
              <InfoHint
                text={
                  <>
                    The apps the wallet may sign a login message for; empty refuses them all. List only verifiers that move
                    no funds, such as a dApp&apos;s login contract. Never list a fund-moving verifier like{' '}
                    <code>intents.near</code>: a login signature could be replayed there to move funds.
                  </>
                }
              />
            </label>
            <input
              type="text"
              value={policyForm.sign_message_allowed_recipients}
              onChange={(e) => update({ sign_message_allowed_recipients: e.target.value })}
              placeholder="app.example.near, …"
              spellCheck={false}
              className={`${FIELD} font-mono`}
            />
          </div>

          <div>
            <RefundAddressesSection rows={policyForm.refund_addresses} onChange={(rows) => update({ refund_addresses: rows })} />
          </div>
        </div>
      </details>

      <details className="rounded-lg border border-border">
        <summary className="px-4 py-3 text-sm font-semibold text-foreground">Policy as JSON</summary>
        <div className="border-t border-border px-4 pb-4">{jsonEditor}</div>
      </details>
    </div>
  );
}

function WarningIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="mt-0.5 h-3 w-3 shrink-0">
      <path d="M8 1.5 15 14H1zM7.25 6v4h1.5V6zm0 5v1.5h1.5V11z" />
    </svg>
  );
}
