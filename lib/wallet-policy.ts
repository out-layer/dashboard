import { actionCreators } from '@near-js/transactions';

// ============================================================================
// Types
// ============================================================================

export interface PolicyForm {
  daily_limit: string;
  hourly_limit: string;
  monthly_limit: string;
  per_transaction_limit: string;
  allowed_tokens: string;
  address_mode: 'whitelist' | 'blacklist' | 'none';
  addresses: string;
  transaction_types: string;
  allowed_hours_start: string;
  allowed_hours_end: string;
  allowed_days: string;
  max_per_hour: string;
  webhook_url: string;
  /** Additional authorized API key hashes (one per line, hex SHA256) */
  additional_key_hashes: string;
  // ── Capabilities (all default-DENY unless enabled; see PolicyFormFields warnings) ──
  /** raw_sign: sign arbitrary bytes on any enabled chain — bypasses the structured policy. */
  raw_sign_enabled: boolean;
  /** Comma-separated chain allowlist for raw_sign; empty = ALL chains (incl. near). */
  raw_sign_chains: string;
  raw_sign_requires_approval: boolean;
  /** confidential: confidential-intents flows. */
  confidential_enabled: boolean;
  /** payment_check: claimable-link escrow — funds reach an arbitrary holder (whitelist-bypass). */
  payment_check_enabled: boolean;
  /** swap: 1Click swap — Trusted (coordinator-supplied quote/route, unbound to policy). */
  swap_enabled: boolean;
  /** cross_chain_withdraw: 1Click swap+bridge — Trusted; the riskiest, irreversible exit. */
  cross_chain_withdraw_enabled: boolean;
  /** limit_order: a swap rested on 1Click at the owner's price. Authorised once,
   *  paid out later with no further signature — so it is gated like an exit.
   *  ONE switch in the form drives both halves of the gate: the default-DENY
   *  capability and the `limit_order` transaction type. */
  limit_order_enabled: boolean;
  /** sign_message: comma-separated NEP-413 recipient allowlist (default-DENY; never fund-moving). */
  sign_message_allowed_recipients: string;
  /** evm_sign: allow EVM signing (EIP-712 / EIP-191 / raw tx). At the engine level this is
   *  DEFAULT-DENY under a policy (like the other fund-moving caps) — an EIP-712 signature is
   *  itself fund-moving (EIP-3009/EIP-2612), so it must be opted in. This form writes it
   *  EXPLICITLY: enabled → `evm_sign.allowed=true`, disabled → `evm_sign.allowed=false`. */
  evm_sign_enabled: boolean;
  /** evm_sign.raw_tx: additionally permit signing arbitrary raw EVM transactions. Default-OFF —
   *  a separate kill-switch (does NOT contain typed-data drains). */
  evm_sign_raw_tx: boolean;
  /** solana_sign: allow Solana signing (raw message bytes). Same model as `evm_sign` —
   *  DEFAULT-DENY at the engine level, so this form writes it explicitly. Without it there
   *  was no way at all to turn Solana signing on for a wallet that has a policy. */
  solana_sign_enabled: boolean;
  /** solana_sign.raw_tx: additionally permit signing serialized transaction messages.
   *  Default-OFF. The base flag covers MESSAGES only, and the keystore refuses a "message"
   *  whose bytes parse as a transaction — so this sub-flag cannot be walked around through
   *  the message endpoint. */
  solana_sign_raw_tx: boolean;
  /** refund_addresses: where a failed cross-chain deposit on each chain is
   *  refunded. One row per chain; `chain` is a canonical deposit chain name. */
  refund_addresses: RefundAddressRow[];
}

export interface RefundAddressRow {
  chain: string;
  address: string;
}

export const DEFAULT_POLICY: PolicyForm = {
  daily_limit: '',
  hourly_limit: '',
  monthly_limit: '',
  per_transaction_limit: '',
  allowed_tokens: '*',
  address_mode: 'none',
  addresses: '',
  // cross_chain_withdraw is intentionally NOT a default — it is the riskiest exit and
  // must be opted in explicitly. intents_deposit folds into `call` (no separate type).
  transaction_types: 'transfer,call,delete,intents_withdraw,intents_swap',
  allowed_hours_start: '',
  allowed_hours_end: '',
  allowed_days: '',
  max_per_hour: '',
  webhook_url: '',
  additional_key_hashes: '',
  raw_sign_enabled: false,
  raw_sign_chains: '',
  raw_sign_requires_approval: false,
  confidential_enabled: false,
  payment_check_enabled: false,
  swap_enabled: false,
  cross_chain_withdraw_enabled: false,
  limit_order_enabled: false,
  sign_message_allowed_recipients: '',
  // EVM-signing checkbox starts UNCHECKED — fund-moving, so opt-in like every
  // other capability (matches the engine's default-DENY). A dashboard policy
  // then writes `evm_sign.allowed=false` until the owner deliberately enables it.
  evm_sign_enabled: false,
  evm_sign_raw_tx: false,
  solana_sign_enabled: false,
  solana_sign_raw_tx: false,
  refund_addresses: [],
};

// ============================================================================
// Refund addresses — mirrors the coordinator's encrypt-policy checks
// (`canonicalize_user_chain` and `validate_refund_address` in
// outlayer-coordinator `src/wallet/cross_chain.rs`)
// ============================================================================

/** Which address rule a chain's refund address is held to. */
export type RefundAddressFamily = 'evm' | 'solana' | 'near' | 'bitcoin' | 'other';

export interface RefundChain {
  /** Canonical name, as the coordinator stores it. */
  id: string;
  label: string;
  family: RefundAddressFamily;
}

/**
 * The chains the deposit endpoints accept, by canonical name. The family is
 * the key the wallet's own address on the chain comes from; a chain the
 * wallet holds no key on is `other` and gets the shape check only — the
 * bridge is the authority on those formats.
 */
export const REFUND_CHAINS: readonly RefundChain[] = [
  { id: 'near', label: 'NEAR', family: 'near' },
  { id: 'ethereum', label: 'Ethereum', family: 'evm' },
  { id: 'base', label: 'Base', family: 'evm' },
  { id: 'arbitrum', label: 'Arbitrum', family: 'evm' },
  { id: 'bsc', label: 'BNB Smart Chain', family: 'evm' },
  { id: 'polygon', label: 'Polygon', family: 'evm' },
  { id: 'optimism', label: 'Optimism', family: 'evm' },
  { id: 'avalanche', label: 'Avalanche', family: 'evm' },
  { id: 'hood', label: 'Robinhood Chain', family: 'evm' },
  { id: 'hypercore', label: 'HyperCore', family: 'evm' },
  { id: 'solana', label: 'Solana', family: 'solana' },
  { id: 'bitcoin', label: 'Bitcoin', family: 'bitcoin' },
  { id: 'zcash', label: 'Zcash', family: 'other' },
  { id: 'dogecoin', label: 'Dogecoin', family: 'other' },
  { id: 'litecoin', label: 'Litecoin', family: 'other' },
  { id: 'bitcoincash', label: 'Bitcoin Cash', family: 'other' },
  { id: 'xrp', label: 'XRP', family: 'other' },
  { id: 'dash', label: 'Dash', family: 'other' },
  { id: 'cardano', label: 'Cardano', family: 'other' },
  { id: 'tron', label: 'Tron', family: 'other' },
  { id: 'sui', label: 'Sui', family: 'other' },
  { id: 'aptos', label: 'Aptos', family: 'other' },
  { id: 'aleo', label: 'Aleo', family: 'other' },
  { id: 'gnosis', label: 'Gnosis', family: 'other' },
  { id: 'berachain', label: 'Berachain', family: 'other' },
  { id: 'movement', label: 'Movement', family: 'other' },
  { id: 'plasma', label: 'Plasma', family: 'other' },
  { id: 'starknet', label: 'Starknet', family: 'other' },
];

const REFUND_CHAIN_ALIASES: Record<string, string> = {
  sol: 'solana',
  eth: 'ethereum',
  arb: 'arbitrum',
  btc: 'bitcoin',
  pol: 'polygon',
  op: 'optimism',
  avax: 'avalanche',
  zec: 'zcash',
  doge: 'dogecoin',
  ltc: 'litecoin',
  bch: 'bitcoincash',
  bera: 'berachain',
};

/** The canonical name of a chain the deposit endpoints accept (aliases and
 *  any letter case included), or `null` for a chain they refuse. */
export function canonicalRefundChain(name: string): string | null {
  const lower = name.trim().toLowerCase();
  const id = REFUND_CHAIN_ALIASES[lower] ?? lower;
  return REFUND_CHAINS.some((c) => c.id === id) ? id : null;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Byte length of a base58 string, or `null` when it is not base58. */
function base58ByteLength(s: string): number | null {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < s.length; i++) {
    let carry = BASE58_ALPHABET.indexOf(s[i]);
    if (carry < 0) return null;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return zeros + bytes.length;
}

/** A NEAR account id: 2-64 of `a-z 0-9 _ - .`, separators never leading,
 *  trailing or adjacent (`account_id_is_well_formed` in shared-tee-helpers). */
function isNearAccountId(id: string): boolean {
  return id.length >= 2 && id.length <= 64 && /^[a-z0-9]+([_.-][a-z0-9]+)*$/.test(id);
}

/**
 * Why `address` cannot be a refund address on `chain`, or `null` when it
 * can. The address is trimmed first, as the coordinator does.
 */
export function refundAddressProblem(chain: string, address: string): string | null {
  const id = canonicalRefundChain(chain);
  if (!id) return `'${chain}' is not a chain the deposit endpoints accept.`;
  const addr = address.trim();
  if (!addr || addr.length > 128 || !/^[\x21-\x7e]+$/.test(addr)) {
    return 'An address is 1-128 printable ASCII characters without whitespace.';
  }
  switch (REFUND_CHAINS.find((c) => c.id === id)!.family) {
    case 'evm':
      return /^0x[0-9a-fA-F]{40}$/.test(addr) ? null : 'An EVM address is `0x` followed by 40 hex characters.';
    case 'solana':
      return base58ByteLength(addr) === 32 ? null : 'A Solana address is a base58-encoded 32-byte public key.';
    case 'near':
      return isNearAccountId(addr) ? null : 'A NEAR address is an account id (lowercase, 2-64 characters).';
    case 'bitcoin': {
      const prefixed = addr.startsWith('bc1') || addr.startsWith('1') || addr.startsWith('3');
      return prefixed && addr.length >= 26 && addr.length <= 90 ? null : 'A Bitcoin address starts with `bc1`, `1` or `3`.';
    }
    case 'other':
      return null;
  }
}

/**
 * Every reason the coordinator would refuse a policy's `refund_addresses`
 * value, one message per entry; empty when it would accept it.
 */
export function refundAddressesProblems(value: unknown): string[] {
  if (value === undefined) return [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return ['refund_addresses is an object of chain name → address.'];
  }
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const [chain, address] of Object.entries(value as Record<string, unknown>)) {
    if (typeof address !== 'string') {
      problems.push(`refund_addresses.${chain}: the address must be a string.`);
      continue;
    }
    const problem = refundAddressProblem(chain, address);
    if (problem) {
      problems.push(`refund_addresses.${chain}: ${problem}`);
      continue;
    }
    const id = canonicalRefundChain(chain)!;
    if (seen.has(id)) problems.push(`refund_addresses names '${id}' twice (under two spellings).`);
    seen.add(id);
  }
  return problems;
}

// ============================================================================
// NEAR ↔ yoctoNEAR conversion helpers
// ============================================================================

/** Convert human-readable NEAR (e.g. "10.5") to yoctoNEAR string */
export function nearToYocto(near: string): string {
  if (!near || near === '0') return '0';
  const parts = near.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(24, '0').slice(0, 24);
  const raw = whole + frac;
  return raw.replace(/^0+/, '') || '0';
}

/** Convert yoctoNEAR string to human-readable NEAR (e.g. "10.5") */
export function yoctoToNear(yocto: string): string {
  if (!yocto || yocto === '0') return '';
  const padded = yocto.padStart(25, '0');
  const whole = padded.slice(0, -24).replace(/^0+/, '') || '0';
  const frac = padded.slice(-24).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

// ============================================================================
// Build policy rules from form state (everything except approval)
// ============================================================================

/**
 * The transaction types a form will SAVE, or `null` when it saves no type rule
 * at all (an empty box: no restriction). `limit_order` is never taken from the
 * box — the capability switch owns it. One function for the builder and for the
 * form's "permits NO transaction type" warning, so the warning cannot describe
 * a different list than the one that is saved.
 */
export function effectiveTransactionTypes(
  form: Pick<PolicyForm, 'transaction_types' | 'limit_order_enabled'>,
): string[] | null {
  if (!form.transaction_types.trim()) return null;
  const types = form.transaction_types.split(',').map((t) => t.trim()).filter((t) => t && t !== 'limit_order');
  if (form.limit_order_enabled) types.push('limit_order');
  return types;
}

/** The form-string spelling of `transaction_types: []` (see `parsePolicyResponse`). */
export const NO_TRANSACTION_TYPES = ',';

export function buildPolicyRules(
  form: PolicyForm,
  apiKeyHash?: string,
): Record<string, unknown> {
  const rules: Record<string, unknown> = {};

  const limits: Record<string, unknown> = {};
  if (form.per_transaction_limit) limits.per_transaction = { native: nearToYocto(form.per_transaction_limit) };
  if (form.daily_limit) limits.daily = { native: nearToYocto(form.daily_limit) };
  if (form.hourly_limit) limits.hourly = { native: nearToYocto(form.hourly_limit) };
  if (form.monthly_limit) limits.monthly = { native: nearToYocto(form.monthly_limit) };
  if (Object.keys(limits).length > 0) rules.limits = limits;

  // The MODE is the switch; the list is data. These used to be one condition
  // (`mode !== 'none' && addresses.trim()`), which made an empty box mean "off"
  // — so a whitelist with an empty list, the strictest possible address rule,
  // was dropped on save and the wallet came back with no address filter at all.
  // Fail-open on a round trip through a form nobody thought they were editing.
  if (form.address_mode !== 'none') {
    rules.addresses = {
      mode: form.address_mode,
      list: form.addresses.split(',').map((a) => a.trim()).filter(Boolean),
    };
  }

  if (form.transaction_types.trim()) {
    // `limit_order` is not a checkbox of its own: the capability switch owns it,
    // so the two halves of the gate cannot be set against each other (a
    // capability without the type — or the type without the capability — reads
    // as "enabled" in the form and is refused by the keystore).
    //
    // The rule is emitted whenever the box held ANYTHING, `limit_order` included
    // — even if what is left is an empty list. An owner who restricted the
    // wallet to limit orders and then switches them off has a wallet that may
    // do nothing, not one that may do everything.
    rules.transaction_types = effectiveTransactionTypes(form);
  }

  if (form.allowed_tokens && form.allowed_tokens !== '*') {
    rules.allowed_tokens = form.allowed_tokens.split(',').map((t) => t.trim()).filter(Boolean);
  }

  if (form.allowed_hours_start || form.allowed_days) {
    const tr: Record<string, unknown> = { timezone: 'UTC' };
    if (form.allowed_hours_start && form.allowed_hours_end) {
      tr.allowed_hours = [parseInt(form.allowed_hours_start, 10), parseInt(form.allowed_hours_end, 10)];
    }
    if (form.allowed_days) {
      tr.allowed_days = form.allowed_days.split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d));
    }
    rules.time_restrictions = tr;
  }

  if (form.max_per_hour) {
    rules.rate_limit = { max_per_hour: parseInt(form.max_per_hour, 10) };
  }

  // Capabilities — each non-Built primitive is default-DENY; emit a capability only when
  // the owner opts in (absence = denied by the keystore). sign_message defaults on but its
  // recipient allowlist is default-DENY, so emit it only when recipients are listed.
  const capabilities: Record<string, unknown> = {};
  if (form.raw_sign_enabled) {
    const rs: Record<string, unknown> = { allowed: true, requires_approval: form.raw_sign_requires_approval };
    const chains = form.raw_sign_chains.split(',').map((c) => c.trim()).filter(Boolean);
    if (chains.length > 0) rs.chains = chains;
    capabilities.raw_sign = rs;
  }
  // Trusted capabilities (confidential/payment_check/swap) are emitted as a bare `allowed`
  // flag; this form does not surface a per-capability requires_approval for them. Multisig for
  // these ops comes from the wallet-level `approval` threshold (since the 2026-06-07 reversal
  // Trusted ops DO participate in multisig: they create a pending approval and execute after the
  // threshold). Per-capability requires_approval would need its own UI field — not added here.
  if (form.confidential_enabled) {
    capabilities.confidential = { allowed: true };
  }
  if (form.payment_check_enabled) {
    capabilities.payment_check = { allowed: true };
  }
  if (form.swap_enabled) {
    capabilities.swap = { allowed: true };
  }
  if (form.cross_chain_withdraw_enabled) {
    capabilities.cross_chain_withdraw = { allowed: true };
  }
  if (form.limit_order_enabled) {
    capabilities.limit_order = { allowed: true };
  }
  const smRecipients = form.sign_message_allowed_recipients.split(',').map((r) => r.trim()).filter(Boolean);
  if (smRecipients.length > 0) {
    capabilities.sign_message = { allowed: true, allowed_recipients: smRecipients };
  }
  // evm_sign is DEFAULT-DENY under a policy, so emit it EXPLICITLY to reflect the
  // form: enabled → {allowed:true}(+raw_tx if opted in); disabled → {allowed:false}.
  {
    const evm: Record<string, unknown> = { allowed: form.evm_sign_enabled };
    if (form.evm_sign_enabled && form.evm_sign_raw_tx) evm.raw_tx = true;
    capabilities.evm_sign = evm;
  }
  // solana_sign: same shape and the same reason — DEFAULT-DENY, so written out
  // either way rather than omitted when off.
  {
    const sol: Record<string, unknown> = { allowed: form.solana_sign_enabled };
    if (form.solana_sign_enabled && form.solana_sign_raw_tx) sol.raw_tx = true;
    capabilities.solana_sign = sol;
  }

  const policy: Record<string, unknown> = {};
  if (Object.keys(rules).length > 0) policy.rules = rules;
  if (Object.keys(capabilities).length > 0) policy.capabilities = capabilities;
  if (form.webhook_url) policy.webhook_url = form.webhook_url;

  // Merge current API key hash + any additional hashes from form
  const keyHashes: string[] = [];
  if (apiKeyHash) keyHashes.push(apiKeyHash);
  if (form.additional_key_hashes.trim()) {
    form.additional_key_hashes.split('\n').map((h) => h.trim()).filter(Boolean).forEach((h) => {
      if (!keyHashes.includes(h)) keyHashes.push(h);
    });
  }
  if (keyHashes.length > 0) policy.authorized_key_hashes = keyHashes;

  // Written only when the owner lists a chain: without it, a chain refunds to
  // the wallet's own address on it. A half-filled row is kept, so the submit
  // check reports it instead of dropping it.
  const refundRows = form.refund_addresses.filter((r) => r.chain || r.address.trim());
  if (refundRows.length > 0) {
    policy.refund_addresses = Object.fromEntries(refundRows.map((r) => [r.chain, r.address.trim()]));
  }

  return policy;
}

// ============================================================================
// Parse policy API response back to form fields
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedPolicy {
  form: PolicyForm;
  /** Approval section (page-specific, returned as-is for the caller to handle) */
  approval: {
    required: string;
    approvers: string; // "account_id, role" lines
  } | null;
  /** The full policy JSON for the editor */
  fullJson: Record<string, unknown>;
}

/**
 * Parse the coordinator's GET /wallet/v1/policy response into form fields.
 * `currentApiKeyHash` is excluded from additional_key_hashes (it's auto-included).
 */
export function parsePolicyResponse(
  data: {
    rules?: any;
    approval?: any;
    capabilities?: any;
    authorized_key_hashes?: string[];
    webhook_url?: string;
    refund_addresses?: Record<string, string>;
  },
  currentApiKeyHash?: string,
): ParsedPolicy {
  const rules = data.rules || {};
  const limits = rules.limits || {};
  const addr = rules.addresses || {};
  const tr = rules.time_restrictions || {};
  const caps = data.capabilities || {};

  const form: PolicyForm = {
    per_transaction_limit: yoctoToNear(limits.per_transaction?.native || limits.per_transaction?.['*'] || ''),
    daily_limit: yoctoToNear(limits.daily?.native || limits.daily?.['*'] || ''),
    hourly_limit: yoctoToNear(limits.hourly?.native || limits.hourly?.['*'] || ''),
    monthly_limit: yoctoToNear(limits.monthly?.native || limits.monthly?.['*'] || ''),
    // THREE states, and collapsing any two of them changes a wallet on save:
    //
    //   no `addresses` section     → no filtering. The engine's
    //     `if let Some(addresses)` never runs. This is the commonest policy
    //     shape there is — limits only, which is what this form writes by
    //     default.
    //   section, no `mode`         → whitelist. `Addresses::mode` in
    //     shared-tee-helpers documents it and both evaluation paths do
    //     `unwrap_or("whitelist")`.
    //   section with a `mode`      → that mode.
    //
    // Reading the second as `none` showed "No restriction", HID the address
    // input, and dropped an enforced whitelist on save. Reading the FIRST as
    // `whitelist` is the same fault mirrored: a limits-only policy comes back
    // as an empty whitelist and saves as deny-all against every destination,
    // which nobody chose. Both are "opened the page, saved something
    // unrelated, changed what the wallet may do".
    address_mode: rules.addresses ? (addr.mode || 'whitelist') : 'none',
    addresses: (addr.list || []).join(', '),
    // `limit_order` stays IN this string even though no checkbox shows it (the
    // capability switch owns it). Cut out here, a policy whose only type is
    // `limit_order` loads as an empty box — which means "no restriction" — and
    // the next Save would drop the rule and permit every other type.
    //
    // A stored EMPTY list is "no type is permitted", and an empty box is "no
    // restriction" — opposites. It loads as a bare separator: non-empty, so
    // `buildPolicyRules` still emits the rule, and holding no type, so the
    // rule it emits is `[]` again.
    transaction_types: rules.transaction_types
      ? (rules.transaction_types.join(',') || NO_TRANSACTION_TYPES)
      : '',
    allowed_tokens: (rules.allowed_tokens || []).join(',') || '*',
    allowed_hours_start: tr.allowed_hours?.[0]?.toString() || '',
    allowed_hours_end: tr.allowed_hours?.[1]?.toString() || '',
    allowed_days: (tr.allowed_days || []).join(','),
    max_per_hour: rules.rate_limit?.max_per_hour?.toString() || '',
    webhook_url: data.webhook_url || '',
    additional_key_hashes: (data.authorized_key_hashes || [])
      .filter((h) => h !== currentApiKeyHash)
      .join('\n'),
    raw_sign_enabled: caps.raw_sign?.allowed === true,
    raw_sign_chains: (caps.raw_sign?.chains || []).join(', '),
    raw_sign_requires_approval: caps.raw_sign?.requires_approval === true,
    confidential_enabled: caps.confidential?.allowed === true,
    payment_check_enabled: caps.payment_check?.allowed === true,
    swap_enabled: caps.swap?.allowed === true,
    cross_chain_withdraw_enabled: caps.cross_chain_withdraw?.allowed === true,
    limit_order_enabled: caps.limit_order?.allowed === true,
    sign_message_allowed_recipients: (caps.sign_message?.allowed_recipients || []).join(', '),
    // evm_sign is DEFAULT-DENY: the form shows it enabled only when the policy
    // explicitly set allowed:true.
    evm_sign_enabled: caps.evm_sign?.allowed === true,
    evm_sign_raw_tx: caps.evm_sign?.raw_tx === true,
    solana_sign_enabled: caps.solana_sign?.allowed === true,
    solana_sign_raw_tx: caps.solana_sign?.raw_tx === true,
    refund_addresses: Object.entries(data.refund_addresses || {}).map(([chain, address]) => ({ chain, address })),
  };

  let approval: ParsedPolicy['approval'] = null;
  if (data.approval) {
    const ap = data.approval;
    const approverLines = (ap.approvers || [])
      .map((a: any) => `${a.id}, ${a.role || 'signer'}`)
      .join('\n');
    approval = {
      required: ap.threshold?.required?.toString() || '1',
      approvers: approverLines,
    };
  }

  // Reconstruct the full JSON (rules + approval + key hashes + webhook)
  const fullJson: Record<string, unknown> = {};
  if (data.rules) fullJson.rules = data.rules;
  if (data.approval) fullJson.approval = data.approval;
  if (data.capabilities) fullJson.capabilities = data.capabilities;
  if (data.webhook_url) fullJson.webhook_url = data.webhook_url;
  if (data.authorized_key_hashes?.length) fullJson.authorized_key_hashes = data.authorized_key_hashes;
  if (data.refund_addresses && Object.keys(data.refund_addresses).length > 0) {
    fullJson.refund_addresses = data.refund_addresses;
  }

  return { form, approval, fullJson };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================================
// Submit policy: encrypt → sign → store on-chain → invalidate cache
// ============================================================================

export interface SubmitPolicyParams {
  coordinatorUrl: string;
  apiKey: string;
  walletId: string;
  policyJsonText: string;
  contractId: string;
  /**
   * The NEAR account that will SEND `store_wallet_policy` — the connected
   * wallet, since it is what signs the transaction below.
   *
   * It is part of the signed message, so the signature is good for that account
   * and no other. Before that, a policy signature was made over the bare
   * ciphertext hash: anyone who read one off the chain could file it again, and
   * any other signature of the same wallet could be filed as a policy.
   */
  callerAccountId: string;
  viewMethod: (params: { contractId: string; method: string; args?: Record<string, unknown> }) => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signAndSendTransaction: (params: any) => Promise<any>;
}

export interface SubmitPolicyResult {
  walletPubkey: string;
}

export async function submitPolicy(params: SubmitPolicyParams): Promise<SubmitPolicyResult> {
  const { coordinatorUrl, apiKey, walletId, policyJsonText, contractId, callerAccountId, viewMethod, signAndSendTransaction } = params;

  if (!callerAccountId) {
    throw new Error('Connect your NEAR wallet first — the policy signature names the account that submits it.');
  }

  // Parse policy JSON
  let policyData: Record<string, unknown>;
  try {
    policyData = JSON.parse(policyJsonText);
  } catch {
    throw new Error('Invalid JSON in policy editor');
  }

  const refundProblems = refundAddressesProblems(policyData.refund_addresses);
  if (refundProblems.length > 0) {
    throw new Error(refundProblems.join(' '));
  }

  // Step 1: Encrypt policy via coordinator
  const encryptResp = await fetch(`${coordinatorUrl}/wallet/v1/encrypt-policy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ wallet_id: walletId, ...policyData }),
  });

  if (!encryptResp.ok) {
    const errorData = await encryptResp.json().catch(() => ({}));
    throw new Error(errorData.message || `Policy encryption failed (HTTP ${encryptResp.status})`);
  }

  const encrypted = await encryptResp.json();

  // Step 2: Sign encrypted policy with agent's ed25519 key. `caller` is signed
  // alongside the blob, so what comes back can only be submitted by the account
  // named here — which is the one that signs the transaction in step 3.
  const signResp = await fetch(`${coordinatorUrl}/wallet/v1/sign-policy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ encrypted_data: encrypted.encrypted_base64, caller: callerAccountId }),
  });

  if (!signResp.ok) {
    const signErr = await signResp.json().catch(() => ({}));
    throw new Error(signErr.message || `Policy signing failed (HTTP ${signResp.status})`);
  }

  const signed = await signResp.json();
  const walletPubkey = `ed25519:${signed.public_key_hex}`;

  // Step 3: Estimate storage cost + store on-chain
  let storageCost = '100000000000000000000000'; // default 0.1 NEAR
  try {
    const cost = await viewMethod({
      contractId,
      method: 'estimate_wallet_policy_cost',
      args: { wallet_pubkey: walletPubkey, encrypted_data: encrypted.encrypted_base64 },
    });
    if (cost) storageCost = cost as string;
  } catch (e) {
    console.warn('estimate_wallet_policy_cost failed, using default:', e);
  }

  const action = actionCreators.functionCall(
    'store_wallet_policy',
    {
      wallet_pubkey: walletPubkey,
      encrypted_data: encrypted.encrypted_base64,
      wallet_signature: signed.signature_hex,
    },
    BigInt('100000000000000'),
    BigInt(storageCost),
  );

  await signAndSendTransaction({ receiverId: contractId, actions: [action] });

  // Step 4: Invalidate coordinator cache + save plaintext policy to DB
  // (so dashboard can read it immediately without waiting for worker sync)
  await fetch(`${coordinatorUrl}/wallet/v1/invalidate-cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_id: walletId, policy_json: policyData }),
  }).catch(() => {});

  return { walletPubkey };
}
