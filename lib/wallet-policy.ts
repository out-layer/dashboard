import { actionCreators } from '@near-js/transactions';

// ============================================================================
// Types
// ============================================================================

export interface PolicyForm {
  /** Native NEAR limits, in NEAR. They cap `native` and no other token. */
  daily_limit: string;
  hourly_limit: string;
  monthly_limit: string;
  per_transaction_limit: string;
  /** Limits of every other token, one row per policy token key. The engine
   *  looks a limit up by the operation's own token, then `*`, and holds a
   *  token with neither to no limit — so a token the agent may move needs a
   *  row of its own. */
  token_limits: TokenLimitRow[];
  /** Only native NEAR and the tokens that have a limit row may move: written
   *  as `allowed_tokens`, derived from the rows, so a token nobody thought
   *  about is refused instead of moving with no limit. */
  only_limited_tokens: boolean;
  /** A hand-written `allowed_tokens` list (`*` = any); read only while
   *  `only_limited_tokens` is off. */
  allowed_tokens: string;
  address_mode: 'whitelist' | 'blacklist' | 'none';
  addresses: string;
  /** Under a whitelist: a payment to an address off the list waits for the
   *  approvers instead of being refused (`addresses.unlisted: "ask"`). Needs
   *  the approval block; the keystore refuses to store it without one. */
  ask_unlisted: boolean;
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
  /** intents_call: a `call` to the NEAR Intents contract (`intents.near`) itself.
   *  SECURITY: DEFAULT-DENY with or without a policy, and off in every new policy.
   *  The contract takes the wallet's own account as the owner of its intents
   *  account, so such a call can add a key that signs for that account outside
   *  the TEE for good — no later policy, freeze or lock removes it — or move any
   *  intents balance past every limit. Written only when the owner opts in;
   *  absent = denied. Needs `call` among the transaction types as well. */
  intents_call_enabled: boolean;
  /** refund_addresses: where a failed cross-chain deposit on each chain is
   *  refunded. One row per chain; `chain` is a canonical deposit chain name. */
  refund_addresses: RefundAddressRow[];
}

/**
 * The limits of one token. `token` is the key the policy engine judges the
 * operation by: an asset's id on intents.near (`nep141:<contract>`,
 * `nep245:<contract>:<id>`), or `*` for every token without a row. The
 * amounts are in the token's minimal units, as the policy stores them; the
 * form converts for display when it knows the token's decimals.
 */
export interface TokenLimitRow {
  token: string;
  per_transaction: string;
  hourly: string;
  daily: string;
  monthly: string;
}

export const LIMIT_WINDOWS = ['per_transaction', 'hourly', 'daily', 'monthly'] as const;
export type LimitWindow = (typeof LIMIT_WINDOWS)[number];

/** The policy key native NEAR is limited under. */
export const NATIVE_TOKEN_KEY = 'native';

export interface RefundAddressRow {
  chain: string;
  address: string;
}

export const DEFAULT_POLICY: PolicyForm = {
  daily_limit: '',
  hourly_limit: '',
  monthly_limit: '',
  per_transaction_limit: '',
  token_limits: [],
  only_limited_tokens: false,
  allowed_tokens: '*',
  address_mode: 'none',
  addresses: '',
  ask_unlisted: false,
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
  // SECURITY: never default this on — see `intents_call_enabled`.
  intents_call_enabled: false,
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

/**
 * A decimal amount (`"12.5"`) in a token's minimal units, or `null` when it
 * is not a non-negative decimal or carries more fraction digits than the
 * token has. Empty stays empty: no limit.
 */
export function unitsFromDecimal(value: string, decimals: number): string | null {
  const v = value.trim();
  if (!v) return '';
  const m = /^(\d*)(?:\.(\d*))?$/.exec(v);
  if (!m || (!m[1] && !m[2])) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  return ((m[1] || '0') + frac.padEnd(decimals, '0')).replace(/^0+(?=\d)/, '');
}

/** Minimal units as a decimal amount; empty for empty or non-integer input. */
export function decimalFromUnits(units: string, decimals: number): string {
  if (!/^\d+$/.test(units)) return '';
  if (decimals === 0) return units.replace(/^0+(?=\d)/, '');
  const padded = units.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals).replace(/^0+(?=\d)/, '');
  const frac = padded.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

/**
 * Why the token limit rows cannot be saved, one message per fault; empty when
 * they can. A cap the keystore cannot read refuses every operation of the
 * wallet, so it is caught where it is typed.
 */
export function tokenLimitsProblems(rows: TokenLimitRow[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const token = row.token.trim();
    if (!token) {
      if (LIMIT_WINDOWS.some((w) => row[w].trim())) problems.push('A limit row names no token.');
      continue;
    }
    if (token === NATIVE_TOKEN_KEY) problems.push('Native NEAR is limited in its own fields, not in a token row.');
    if (seen.has(token)) problems.push(`Token '${token}' has two limit rows.`);
    seen.add(token);
    for (const w of LIMIT_WINDOWS) {
      if (row[w] && !/^\d+$/.test(row[w])) {
        problems.push(`The ${w.replace('_', ' ')} limit of '${token}' is not a whole number of minimal units.`);
      }
    }
  }
  return problems;
}

// ============================================================================
// Build policy rules from form state (everything except approval)
// ============================================================================

/**
 * Transaction types a capability switch owns: the engine holds such an
 * operation to BOTH its default-deny capability and — when the policy has a
 * type rule — its type, so the form drives the two halves with one switch. A
 * capability without its type (or the type without the capability) would read
 * as "enabled" and be refused by the keystore.
 */
const CAPABILITY_TYPES: ReadonlyArray<{
  flag: 'limit_order_enabled' | 'cross_chain_withdraw_enabled' | 'swap_enabled' | 'payment_check_enabled' | 'confidential_enabled' | 'raw_sign_enabled';
  /** Every spelling the engine accepts for the type. */
  aliases: readonly string[];
  /** The spelling this form writes. */
  write: string;
}> = [
  { flag: 'limit_order_enabled', aliases: ['limit_order'], write: 'limit_order' },
  { flag: 'cross_chain_withdraw_enabled', aliases: ['cross_chain_withdraw'], write: 'cross_chain_withdraw' },
  { flag: 'swap_enabled', aliases: ['swap', 'intents_swap'], write: 'intents_swap' },
  { flag: 'payment_check_enabled', aliases: ['payment_check'], write: 'payment_check' },
  { flag: 'confidential_enabled', aliases: ['confidential'], write: 'confidential' },
  { flag: 'raw_sign_enabled', aliases: ['raw'], write: 'raw' },
];

const CAPABILITY_OWNED_TYPES = new Set(CAPABILITY_TYPES.flatMap((c) => c.aliases));

/** The types a checkbox of the form switches; every other type follows a capability. */
export const BASE_TRANSACTION_TYPES = ['transfer', 'intents_withdraw', 'intents_transfer', 'call', 'delete'] as const;

/**
 * The transaction types a form will SAVE, or `null` when it saves no type rule
 * at all (an empty box: no restriction). A type a capability owns is never
 * taken from the box — its switch decides. One function for the builder and
 * for the form's "permits NO transaction type" warning, so the warning cannot
 * describe a different list than the one that is saved.
 */
export function effectiveTransactionTypes(form: PolicyForm): string[] | null {
  if (!form.transaction_types.trim()) return null;
  const types = form.transaction_types.split(',').map((t) => t.trim()).filter((t) => t && !CAPABILITY_OWNED_TYPES.has(t));
  for (const cap of CAPABILITY_TYPES) {
    if (form[cap.flag]) types.push(cap.write);
  }
  return types;
}

/** The tokens `only_limited_tokens` permits: native NEAR and every token with a limit row. */
export function limitedTokens(form: Pick<PolicyForm, 'token_limits'>): string[] {
  const tokens = [NATIVE_TOKEN_KEY];
  for (const row of form.token_limits) {
    const token = row.token.trim();
    if (token && token !== '*' && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

/** The form-string spelling of `transaction_types: []` (see `parsePolicyResponse`). */
export const NO_TRANSACTION_TYPES = ',';

/**
 * The form's type box with one type switched. Unticking the last type leaves
 * the bare separator, never an empty box: the rule stays ("nothing else is
 * permitted") instead of turning into "no restriction".
 */
export function toggledTransactionTypes(box: string, type: string): string {
  const types = box.split(',').map((t) => t.trim()).filter(Boolean);
  const next = types.includes(type) ? types.filter((t) => t !== type) : [...types, type];
  return next.join(',') || NO_TRANSACTION_TYPES;
}

/** A JSON object, or `null` for anything else. */
function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** `built` with the keys of `stored` it does not have. What the form wrote always stands. */
function withUnknownKeys(built: Record<string, unknown>, stored: unknown, known: readonly string[]): Record<string, unknown> {
  const from = asObject(stored);
  if (!from) return built;
  const out = { ...built };
  for (const [key, value] of Object.entries(from)) {
    if (!known.includes(key) && !(key in out)) out[key] = value;
  }
  return out;
}

const FORM_RULE_KEYS = ['limits', 'addresses', 'transaction_types', 'allowed_tokens', 'time_restrictions', 'rate_limit'] as const;
const FORM_CAPABILITIES = [
  'raw_sign', 'confidential', 'payment_check', 'swap', 'cross_chain_withdraw', 'limit_order',
  'sign_message', 'evm_sign', 'solana_sign', 'intents_call',
] as const;

/**
 * What the stored policy holds that the form has no field for, carried into
 * what the form built — so a policy written through the API or the JSON editor
 * keeps those parts when the form saves it.
 *
 * Only around what the form still writes: an unknown rule, an unknown member of
 * a section the form emits (`limits.hourly_tx_count`, a capability's
 * `requires_approval`), a capability the form has no switch for. A
 * section or a capability the form does NOT emit is gone with everything in it:
 * nothing switched off comes back through here.
 */
function carryStored(built: Record<string, unknown>, stored: unknown): Record<string, unknown> {
  const from = asObject(stored);
  if (!from) return built;
  const out = { ...built };

  const storedRules = asObject(from.rules);
  if (storedRules) {
    let rules = withUnknownKeys(asObject(out.rules) ?? {}, storedRules, FORM_RULE_KEYS);
    // `limits` holds one member the form has no field for; it is kept even
    // when the form writes no limit of its own.
    const storedLimits = asObject(storedRules.limits);
    if (storedLimits) {
      const limits = withUnknownKeys(asObject(rules.limits) ?? {}, storedLimits, LIMIT_WINDOWS);
      if (Object.keys(limits).length > 0) rules = { ...rules, limits };
    }
    for (const section of ['time_restrictions', 'rate_limit', 'addresses'] as const) {
      const builtSection = asObject(rules[section]);
      if (!builtSection) continue;
      const merged: Record<string, unknown> = { ...asObject(storedRules[section]), ...builtSection };
      // `unlisted` is the form's own switch: off is its absence.
      if (section === 'addresses' && !('unlisted' in builtSection)) delete merged.unlisted;
      rules = { ...rules, [section]: merged };
    }
    if (Object.keys(rules).length > 0) out.rules = rules;
  }

  const storedCaps = asObject(from.capabilities);
  if (storedCaps) {
    const caps: Record<string, unknown> = { ...asObject(out.capabilities) };
    for (const [name, value] of Object.entries(storedCaps)) {
      if (!(FORM_CAPABILITIES as readonly string[]).includes(name)) {
        if (!(name in caps)) caps[name] = value;
        continue;
      }
      const builtCap = asObject(caps[name]);
      // A capability the form wrote as allowed keeps its other members; one it
      // wrote as refused, or did not write, takes nothing from the stored one.
      if (builtCap && builtCap.allowed === true) caps[name] = { ...asObject(value), ...builtCap };
    }
    if (Object.keys(caps).length > 0) out.capabilities = caps;
  }
  return out;
}

/**
 * The policy a form describes. `stored` is the policy the form was loaded
 * from, when there is one: what it holds beyond the form's fields is carried
 * over (`carryStored`).
 */
export function buildPolicyRules(
  form: PolicyForm,
  apiKeyHash?: string,
  stored?: unknown,
): Record<string, unknown> {
  const rules: Record<string, unknown> = {};

  const nativeLimits: Record<LimitWindow, string> = {
    per_transaction: form.per_transaction_limit,
    hourly: form.hourly_limit,
    daily: form.daily_limit,
    monthly: form.monthly_limit,
  };
  const limits: Record<string, Record<string, string>> = {};
  for (const w of LIMIT_WINDOWS) {
    const byToken: Record<string, string> = {};
    if (nativeLimits[w]) byToken[NATIVE_TOKEN_KEY] = nearToYocto(nativeLimits[w]);
    for (const row of form.token_limits) {
      const token = row.token.trim();
      if (token && token !== NATIVE_TOKEN_KEY && row[w]) byToken[token] = row[w];
    }
    if (Object.keys(byToken).length > 0) limits[w] = byToken;
  }
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
      ...(form.address_mode === 'whitelist' && form.ask_unlisted ? { unlisted: 'ask' } : {}),
    };
  }

  if (form.transaction_types.trim()) {
    // The rule is emitted whenever the box held ANYTHING, a capability's type
    // included — even if what is left is an empty list. An owner who restricted
    // the wallet to limit orders and then switches them off has a wallet that
    // may do nothing, not one that may do everything.
    rules.transaction_types = effectiveTransactionTypes(form);
  }

  if (form.only_limited_tokens) {
    rules.allowed_tokens = limitedTokens(form);
  } else if (form.allowed_tokens && form.allowed_tokens !== '*') {
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
  // SECURITY: a call to intents.near hands the agent the wallet's intents
  // account. Emitted only on an explicit opt-in; absent = denied by the keystore.
  if (form.intents_call_enabled) {
    capabilities.intents_call = { allowed: true };
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

  return carryStored(policy, stored);
}

/**
 * An approval block the form built, with the members of the stored one the
 * form has no field for.
 */
export function approvalWithStored(built: Record<string, unknown>, stored: unknown): Record<string, unknown> {
  return withUnknownKeys(built, stored, ['threshold', 'approvers', 'excluded_types', 'locked', 'auto_up_to']);
}

// ============================================================================
// `approval.auto_up_to`: what leaves in a window without the approvers
// ============================================================================

/** The windows a threshold is counted over: the clock hour, the UTC day, the calendar month. */
export const AUTO_WINDOWS = ['hourly', 'daily', 'monthly'] as const;
export type AutoWindow = (typeof AUTO_WINDOWS)[number];

/**
 * The threshold as the form edits it: one window, and per policy token key
 * (`native` included) the total in minimal units that may leave in it without
 * the approvers. A token with no amount always waits.
 */
export interface AutoApproval {
  window: AutoWindow;
  amounts: Record<string, string>;
}

export const NO_AUTO_APPROVAL: AutoApproval = { window: 'daily', amounts: {} };

/** `approval.auto_up_to` as the form writes it, or `null` when no token has an amount. */
export function buildAutoUpTo(auto: AutoApproval): Record<string, Record<string, string>> | null {
  const entries = Object.entries(auto.amounts)
    .map(([token, amount]) => [token.trim(), amount.trim()] as const)
    .filter(([token, amount]) => token && amount);
  return entries.length > 0 ? { [auto.window]: Object.fromEntries(entries) } : null;
}

/**
 * A stored `approval.auto_up_to` for the form. The form edits one window; a
 * policy that sets several keeps them as stored (`several`) and the form shows
 * them without editing.
 */
export function parseAutoUpTo(stored: unknown): { auto: AutoApproval; several: Record<string, unknown> | null } {
  const from = asObject(stored);
  if (!from) return { auto: NO_AUTO_APPROVAL, several: null };
  const set = AUTO_WINDOWS.filter((w) => Object.keys(asObject(from[w]) ?? {}).length > 0);
  const unknown = Object.keys(from).some((k) => !(AUTO_WINDOWS as readonly string[]).includes(k));
  if (set.length === 0 && !unknown) return { auto: NO_AUTO_APPROVAL, several: null };
  if (set.length !== 1 || unknown) return { auto: NO_AUTO_APPROVAL, several: from };
  const amounts = Object.fromEntries(Object.entries(asObject(from[set[0]])!).map(([token, amount]) => [token, String(amount)]));
  return { auto: { window: set[0], amounts }, several: null };
}

/** Why the threshold cannot be saved, one message per fault; empty when it can. */
export function autoUpToProblems(auto: AutoApproval): string[] {
  const problems: string[] = [];
  for (const [token, amount] of Object.entries(auto.amounts)) {
    if (!amount.trim()) continue;
    if (token.trim() === '*') problems.push('The amount that runs without approval is set per token: there is no "every other token" row for it.');
    else if (!/^\d+$/.test(amount.trim())) problems.push(`The amount of '${token}' that runs without approval is not a whole number of minimal units.`);
  }
  return problems;
}

const AUTO_WINDOW_WORDS: Record<AutoWindow, string> = { hourly: 'an hour', daily: 'a day', monthly: 'a month' };

// ============================================================================
// Parse policy API response back to form fields
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ParsedPolicy {
  form: PolicyForm;
  /** Approval section (page-specific, returned as-is for the caller to handle) */
  approval: {
    required: string;
    approvers: string; // "account_id[, role][, pubkey]" lines
  } | null;
  /**
   * Capabilities the stored policy allows while its own type rule refuses
   * their operations: stored as on, never working. The form shows them off —
   * switching one on is the owner's decision, not a side effect of a save.
   */
  inertCapabilities: string[];
  /** The full policy JSON for the editor */
  fullJson: Record<string, unknown>;
}

/**
 * Parse the coordinator's GET /wallet/v1/policy response into form fields.
 * `currentApiKeyHash` is excluded from additional_key_hashes (it's auto-included).
 */
/**
 * One approver of the policy's multisig, as the form edits it: one line
 * `account_id[, role][, pubkey]`. `role` is a label the policy carries and
 * nothing reads — every approver's vote counts the same — so a stored one is
 * shown and written back as it is, and a line without one is given `signer`.
 * A value starting `ed25519:` is the key, wherever it stands. `pubkey` pins the approver to that one key —
 * without it the account votes with any of its full-access keys, or through
 * its wallet contract — so a line read from a stored policy keeps it, and a
 * save writes it back. Losing it on a round trip would quietly widen who may
 * vote in the approver's name.
 */
export type Approver = { id: string; role: string; pubkey?: string };

export function approverLine(a: { id?: unknown; role?: unknown; pubkey?: unknown }): string {
  const parts = [String(a.id ?? ''), typeof a.role === 'string' && a.role ? a.role : 'signer'];
  if (typeof a.pubkey === 'string' && a.pubkey.trim()) parts.push(a.pubkey.trim());
  return parts.join(', ');
}

export function parseApproverLine(line: string): Approver | null {
  const [id, ...rest] = line.split(',').map((s) => s.trim());
  if (!id) return null;
  const pubkey = rest.find((part) => part.startsWith('ed25519:'));
  const role = rest.find((part) => part && !part.startsWith('ed25519:')) || 'signer';
  return pubkey ? { id, role, pubkey } : { id, role };
}

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

  // Every token key any window names gets a row, `*` included: a key the
  // form did not carry would be dropped on the next save, and the token it
  // capped would come back with no limit.
  const limitTokens: string[] = [];
  for (const w of LIMIT_WINDOWS) {
    for (const token of Object.keys(limits[w] || {})) {
      if (token !== NATIVE_TOKEN_KEY && !limitTokens.includes(token)) limitTokens.push(token);
    }
  }
  const tokenLimits: TokenLimitRow[] = limitTokens.map((token) => ({
    token,
    per_transaction: String(limits.per_transaction?.[token] ?? ''),
    hourly: String(limits.hourly?.[token] ?? ''),
    daily: String(limits.daily?.[token] ?? ''),
    monthly: String(limits.monthly?.[token] ?? ''),
  }));

  // A capability switch reads as on only when the operation would in fact be
  // permitted: the capability allowed AND, under a type rule, its type listed.
  const storedTypes: string[] | null = Array.isArray(rules.transaction_types) ? rules.transaction_types : null;
  const inertCapabilities: string[] = [];
  const capabilityOn = (name: string, flag: (typeof CAPABILITY_TYPES)[number]['flag']): boolean => {
    if (caps[name]?.allowed !== true) return false;
    if (!storedTypes) return true;
    const aliases = CAPABILITY_TYPES.find((c) => c.flag === flag)!.aliases;
    if (storedTypes.some((t) => aliases.includes(t))) return true;
    inertCapabilities.push(name);
    return false;
  };

  // `allowed_tokens` that names native and every limited token is the form's
  // own switch: each further token it names is a row with no amounts yet (the
  // token may move, uncapped), which is what the list alone says. A list that
  // leaves out native or a limited token was written by hand and stays as
  // written.
  const storedTokens: string[] | null = Array.isArray(rules.allowed_tokens) ? rules.allowed_tokens : null;
  const onlyLimited =
    storedTokens !== null &&
    storedTokens.includes(NATIVE_TOKEN_KEY) &&
    !storedTokens.includes('*') &&
    limitTokens.every((t) => t === '*' || storedTokens.includes(t));
  if (onlyLimited) {
    for (const token of storedTokens!) {
      if (token !== NATIVE_TOKEN_KEY && !limitTokens.includes(token)) {
        tokenLimits.push({ token, per_transaction: '', hourly: '', daily: '', monthly: '' });
      }
    }
  }

  const form: PolicyForm = {
    per_transaction_limit: yoctoToNear(limits.per_transaction?.native || ''),
    daily_limit: yoctoToNear(limits.daily?.native || ''),
    hourly_limit: yoctoToNear(limits.hourly?.native || ''),
    monthly_limit: yoctoToNear(limits.monthly?.native || ''),
    token_limits: tokenLimits,
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
    ask_unlisted: Boolean(rules.addresses) && (addr.mode || 'whitelist') === 'whitelist' && addr.unlisted === 'ask',
    // A capability's type is its switch's to write, so it is not kept in this
    // string. A stored list that holds nothing else — or nothing at all — is
    // still a RULE ("no other type is permitted"), and an empty box is "no
    // restriction", the opposite: it loads as a bare separator, non-empty, so
    // `buildPolicyRules` still emits the rule.
    transaction_types: storedTypes
      ? (storedTypes.filter((t) => !CAPABILITY_OWNED_TYPES.has(t)).join(',') || NO_TRANSACTION_TYPES)
      : '',
    only_limited_tokens: onlyLimited,
    // A stored EMPTY list permits no token; an absent one permits every token.
    // The empty one loads as a bare separator, so it is saved as empty again.
    allowed_tokens: onlyLimited ? '*' : (storedTokens || []).join(',') || (storedTokens ? ',' : '*'),
    allowed_hours_start: tr.allowed_hours?.[0]?.toString() || '',
    allowed_hours_end: tr.allowed_hours?.[1]?.toString() || '',
    allowed_days: (tr.allowed_days || []).join(','),
    max_per_hour: rules.rate_limit?.max_per_hour?.toString() || '',
    webhook_url: data.webhook_url || '',
    additional_key_hashes: (data.authorized_key_hashes || [])
      .filter((h) => h !== currentApiKeyHash)
      .join('\n'),
    raw_sign_enabled: capabilityOn('raw_sign', 'raw_sign_enabled'),
    raw_sign_chains: (caps.raw_sign?.chains || []).join(', '),
    raw_sign_requires_approval: caps.raw_sign?.requires_approval === true,
    confidential_enabled: capabilityOn('confidential', 'confidential_enabled'),
    payment_check_enabled: capabilityOn('payment_check', 'payment_check_enabled'),
    swap_enabled: capabilityOn('swap', 'swap_enabled'),
    cross_chain_withdraw_enabled: capabilityOn('cross_chain_withdraw', 'cross_chain_withdraw_enabled'),
    limit_order_enabled: capabilityOn('limit_order', 'limit_order_enabled'),
    sign_message_allowed_recipients: (caps.sign_message?.allowed_recipients || []).join(', '),
    // evm_sign is DEFAULT-DENY: the form shows it enabled only when the policy
    // explicitly set allowed:true.
    evm_sign_enabled: caps.evm_sign?.allowed === true,
    evm_sign_raw_tx: caps.evm_sign?.raw_tx === true,
    solana_sign_enabled: caps.solana_sign?.allowed === true,
    solana_sign_raw_tx: caps.solana_sign?.raw_tx === true,
    intents_call_enabled: caps.intents_call?.allowed === true,
    refund_addresses: Object.entries(data.refund_addresses || {}).map(([chain, address]) => ({ chain, address })),
  };

  let approval: ParsedPolicy['approval'] = null;
  if (data.approval) {
    const ap = data.approval;
    const approverLines = (ap.approvers || []).map(approverLine).join('\n');
    // The threshold is stored as a bare number or as `{required}`; an object
    // that names no number means 2 to the engine.
    const threshold = ap.threshold;
    const required =
      typeof threshold === 'number' ? threshold
        : threshold && typeof threshold === 'object' ? (typeof threshold.required === 'number' ? threshold.required : 2)
          : 1;
    approval = {
      required: String(required),
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

  return { form, approval, inertCapabilities, fullJson };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================================================
// The protected start, the address list, and the policy in words
// ============================================================================

/** The addresses of a form's list, as written. */
export function addressList(form: Pick<PolicyForm, 'addresses'>): string[] {
  return form.addresses.split(',').map((a) => a.trim()).filter(Boolean);
}

/** Whether two spellings name one address: account ids and hex addresses compare without case. */
export function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The policy a new agent wallet starts from: money leaves only to the listed
 * addresses — the owner's account and the wallet's own, where a withdrawal
 * with no recipient lands — as a transfer or a withdrawal, on NEAR or to
 * another chain. No contract call, so a contract listed by mistake opens
 * nothing; every other capability off; only tokens with a limit row move.
 */
export function protectedAgentPolicy(params: {
  ownerAccount: string;
  walletAccount: string;
  /** Tokens to open a limit row for (the amounts are the owner's to type). */
  tokens?: string[];
}): PolicyForm {
  const { ownerAccount, walletAccount, tokens = [] } = params;
  return {
    ...DEFAULT_POLICY,
    address_mode: 'whitelist',
    addresses: [ownerAccount, walletAccount].filter(Boolean).join(', '),
    transaction_types: 'transfer,intents_withdraw,intents_transfer',
    cross_chain_withdraw_enabled: true,
    only_limited_tokens: true,
    token_limits: tokens.map((token) => ({ token, per_transaction: '', hourly: '', daily: '', monthly: '' })),
  };
}

/**
 * A form with `addresses` put on its list. `added` are the ones that were not
 * there; on a form that filters nothing, or blocks its list, nothing is added
 * — `mode` says which, for the page to explain.
 */
export function withAddresses(form: PolicyForm, addresses: string[]): { form: PolicyForm; added: string[]; mode: PolicyForm['address_mode'] } {
  if (form.address_mode !== 'whitelist') return { form, added: [], mode: form.address_mode };
  const list = addressList(form);
  const added: string[] = [];
  for (const raw of addresses) {
    const address = raw.trim();
    if (!address || list.some((a) => sameAddress(a, address))) continue;
    list.push(address);
    added.push(address);
  }
  return { form: added.length > 0 ? { ...form, addresses: list.join(', ') } : form, added, mode: 'whitelist' };
}

/** Why an address cannot go on the list, or `null`: one printable token, no separators the list uses. */
export function addressProblem(address: string): string | null {
  const a = address.trim();
  if (!a) return 'An address is empty.';
  if (a.length > 128 || !/^[\x21-\x7e]+$/.test(a) || a.includes(',')) {
    return `'${a.slice(0, 40)}' is not an address: 1-128 printable characters, no spaces or commas.`;
  }
  return null;
}

/** How a token is named and scaled in the summary; `null` when the catalog does not know it. */
export type TokenLabel = (tokenKey: string) => { symbol: string; decimals: number } | null;

export interface PolicySummary {
  /** What the wallet's key may do. */
  can: string[];
  /** What it may not, of the things an owner would ask about. */
  cannot: string[];
  /** What deserves a second look: a missing limit, a capability that reaches past the address list. */
  cautions: string[];
}

const WINDOW_WORDS: Record<LimitWindow, string> = {
  per_transaction: 'per transaction',
  hourly: 'per hour',
  daily: 'per day',
  monthly: 'per month',
};

/**
 * The form in words, for the owner who opens nothing else. Built from the
 * form, so it describes the policy only while the JSON is the form's own.
 */
export function summarizePolicy(
  form: PolicyForm,
  options: {
    approval: boolean;
    tokenLabel?: TokenLabel;
    auto?: AutoApproval | null;
    /** The stored policy sets amounts for several periods, kept as stored: the form cannot put them in words. */
    autoKept?: boolean;
  },
): PolicySummary {
  const can: string[] = [];
  const cannot: string[] = [];
  const cautions: string[] = [];
  const types = effectiveTransactionTypes(form);
  const typeOn = (t: string) => types === null || types.includes(t);
  const list = addressList(form);

  const sends = typeOn('transfer') || typeOn('intents_withdraw') || typeOn('intents_transfer') || form.cross_chain_withdraw_enabled;
  if (!sends) {
    cannot.push('Send money anywhere: no transfer or withdrawal is permitted.');
  } else if (form.address_mode === 'whitelist') {
    if (list.length === 0) cannot.push('Send money anywhere: the address list is empty.');
    else can.push(`Send money only to the ${list.length} listed address${list.length === 1 ? '' : 'es'}${form.cross_chain_withdraw_enabled ? ', on NEAR or another chain' : ', on NEAR'}.`);
  } else if (form.address_mode === 'blacklist') {
    can.push(`Send money to any address except the ${list.length} listed.`);
    cautions.push('Any address not on the block list can be paid.');
  } else {
    can.push('Send money to any address.');
    cautions.push('No address list: a leaked key can pay anyone, within the limits.');
  }
  if (sends && !form.cross_chain_withdraw_enabled) cannot.push('Send to another chain.');

  // Limits, token by token.
  const amount = (units: string, decimals: number) => decimalFromUnits(units, decimals);
  const limitWords = (values: Record<LimitWindow, string>) =>
    LIMIT_WINDOWS.filter((w) => values[w]).map((w) => `${values[w]} ${WINDOW_WORDS[w]}`).join(', ');
  const nativeWords = limitWords({
    per_transaction: form.per_transaction_limit,
    hourly: form.hourly_limit,
    daily: form.daily_limit,
    monthly: form.monthly_limit,
  });
  const wildcard = form.token_limits.find((r) => r.token.trim() === '*');
  const wildcardHasLimit = wildcard ? LIMIT_WINDOWS.some((w) => wildcard[w]) : false;
  if (sends) {
    if (nativeWords) can.push(`NEAR: up to ${nativeWords}.`);
    else if (!wildcardHasLimit) cautions.push('NEAR has no limit.');
    for (const row of form.token_limits) {
      const token = row.token.trim();
      if (!token || token === '*') continue;
      const label = options.tokenLabel?.(token) ?? null;
      const name = label ? label.symbol : token;
      const words = limitWords({
        per_transaction: row.per_transaction && label ? amount(row.per_transaction, label.decimals) : row.per_transaction,
        hourly: row.hourly && label ? amount(row.hourly, label.decimals) : row.hourly,
        daily: row.daily && label ? amount(row.daily, label.decimals) : row.daily,
        monthly: row.monthly && label ? amount(row.monthly, label.decimals) : row.monthly,
      });
      if (words) can.push(`${name}: up to ${words}${label ? '' : ' (minimal units)'}.`);
      else if (!wildcardHasLimit) cautions.push(`${name} has no limit.`);
    }
    if (form.only_limited_tokens) {
      cannot.push('Move a token that has no limit row.');
    } else if (form.allowed_tokens.trim() && form.allowed_tokens.trim() !== '*') {
      can.push(`Move only these tokens: ${form.allowed_tokens}.`);
    } else if (!wildcardHasLimit) {
      cautions.push('Any other token moves with no limit.');
    }
  }

  const switchable: Array<[boolean, string, string]> = [
    [form.swap_enabled, 'Swap tokens.', 'Swap tokens.'],
    [form.limit_order_enabled, 'Place limit orders, paid out to a listed address.', 'Place limit orders.'],
    [form.payment_check_enabled, 'Create payment links anyone holding the link can claim.', 'Create payment links.'],
    [form.confidential_enabled, 'Use confidential balances and transfers.', 'Use confidential balances.'],
    [form.evm_sign_enabled, 'Sign on EVM chains.', 'Sign on EVM chains.'],
    [form.solana_sign_enabled, 'Sign on Solana.', 'Sign on Solana.'],
    [typeOn('call'), 'Call contracts on NEAR.', 'Call contracts.'],
    [typeOn('delete'), 'Delete the wallet account.', 'Delete the wallet account.'],
    [form.raw_sign_enabled, 'Sign raw payloads.', 'Sign raw payloads.'],
    [form.intents_call_enabled && typeOn('call'), 'Call the NEAR Intents contract directly.', ''],
  ];
  for (const [on, yes, no] of switchable) {
    if (on) can.push(yes);
    else if (no) cannot.push(no);
  }

  if (form.payment_check_enabled && form.address_mode === 'whitelist') {
    cautions.push('A payment link pays whoever holds it: the address list does not apply to it.');
  }
  if (form.evm_sign_enabled) cautions.push('An EVM signature can move whatever the wallet holds on its EVM address, to anyone.');
  if (form.solana_sign_enabled && form.solana_sign_raw_tx) cautions.push('A Solana transaction signature can move whatever the wallet holds on its Solana address, to anyone.');
  if (form.raw_sign_enabled) cautions.push('A raw signature is outside the address list and the limits.');
  if (form.intents_call_enabled && typeOn('call')) cautions.push('A direct call to NEAR Intents can hand the wallet’s intents balance to another key for good.');
  if (typeOn('call') && form.address_mode === 'whitelist') {
    cautions.push('A contract on the address list can be called with any arguments: list a token contract and its transfers go anywhere.');
  }
  if (options.approval) {
    const alone = Object.entries(options.auto?.amounts ?? {})
      .filter(([, units]) => units.trim())
      .map(([token, units]) => {
        if (token === NATIVE_TOKEN_KEY) return `${yoctoToNear(units)} NEAR`;
        const label = options.tokenLabel?.(token) ?? null;
        return label ? `${decimalFromUnits(units, label.decimals)} ${label.symbol}` : `${units} ${token} (minimal units)`;
      });
    if (alone.length > 0 && options.auto) {
      can.push(`Transfer and withdraw without asking you while the total stays within ${alone.join(', ')} ${AUTO_WINDOW_WORDS[options.auto.window]}; past that, and for every other operation you chose, it waits for your approval.`);
    } else if (options.autoKept) {
      can.push('Transfer and withdraw without asking you up to the amounts the stored policy sets for several periods; past them, and for every other operation you chose, it waits for your approval.');
    } else {
      can.push('Operations you chose wait for your approval before they run.');
    }
    if (form.ask_unlisted && form.address_mode === 'whitelist') {
      can.push('Ask you to approve a transfer or a withdrawal to an address that is not on the list.');
      cannot.push('Call a contract, delete the account or place an order toward an address that is not on the list: refused, not asked.');
      cautions.push('A new address asks instead of being refused: read the address before you approve.');
    }
  }

  return { can, cannot, cautions };
}

// ============================================================================
// Store a policy: prepare (encrypt → sign → estimate, no wallet) and store
// (one transaction, from a click)
// ============================================================================

type ViewMethod = (params: { contractId: string; method: string; args?: Record<string, unknown> }) => Promise<unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignAndSendTransaction = (params: any) => Promise<any>;

export interface PreparePolicyParams {
  coordinatorUrl: string;
  apiKey: string;
  walletId: string;
  policyJsonText: string;
  contractId: string;
  /**
   * The NEAR account that will SEND `store_wallet_policy` — the connected
   * wallet, since it is what signs the transaction.
   *
   * It is part of the signed message, so the signature is good for that
   * account and no other: a signature read off the chain cannot be filed by
   * anyone else, and no other signature of the wallet can be filed as a policy.
   */
  callerAccountId: string;
  viewMethod: ViewMethod;
}

/** A signed write, as the contract's `store_wallet_policy` takes it. */
export interface ApprovedPolicyWrite {
  walletPubkey: string;
  encryptedData: string;
  walletSignature: string;
  version: number;
  locked: boolean;
  /** Unix seconds; the contract refuses the signature after it. Signed. */
  validUntil: number;
}

/** A write that needs only the owner's transaction: the signed blob and its storage deposit. */
export interface PreparedPolicyWrite {
  write: ApprovedPolicyWrite;
  /** The storage deposit `store_wallet_policy` is sent with, in yoctoNEAR. */
  depositYocto: string;
}

/**
 * Either the write is ready for the owner's transaction, or — when the policy
 * it replaces is locked (`approval.locked`) — it waits for that policy's
 * approvers: the signature appears on the request once the threshold is met
 * (`prepareApprovedPolicy`).
 */
export type PreparePolicyResult =
  | { pending: false; prepared: PreparedPolicyWrite }
  | { pending: true; approvalId: string; requestId: string; requiredApprovals: number };

/**
 * Everything a policy write needs short of the owner's transaction: the
 * coordinator encrypts the policy to the keystore, the keystore signs it for
 * `callerAccountId`, and the contract prices its storage. Opens no wallet.
 *
 * Replacing a LOCKED policy files a request with its approvers, so this is
 * not something to run speculatively against a wallet that has a policy.
 */
export async function preparePolicyWrite(params: PreparePolicyParams): Promise<PreparePolicyResult> {
  const { coordinatorUrl, apiKey, walletId, policyJsonText, contractId, callerAccountId, viewMethod } = params;

  if (!callerAccountId) {
    throw new Error('Connect your NEAR wallet first — the policy signature names the account that submits it.');
  }

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

  // A locked policy: the approvers of the policy being replaced decide, and
  // nothing goes on chain until they have.
  if (signed.status === 'pending_approval') {
    return {
      pending: true,
      approvalId: String(signed.approval_id),
      requestId: String(signed.request_id),
      requiredApprovals: Number(signed.required_approvals ?? 0),
    };
  }

  const write: ApprovedPolicyWrite = {
    walletPubkey: `ed25519:${signed.public_key_hex}`,
    encryptedData: encrypted.encrypted_base64,
    walletSignature: signed.signature_hex,
    // All three are inside the signature: the keystore's answer, never a value of our own.
    version: Number(signed.version),
    locked: Boolean(signed.locked),
    validUntil: Number(signed.valid_until),
  };
  return { pending: false, prepared: { write, depositYocto: await policyStorageDeposit(contractId, viewMethod, write) } };
}

/** Whether a prepared write's signature is still good to send. */
export function preparedWriteIsFresh(prepared: PreparedPolicyWrite): boolean {
  return prepared.write.validUntil * 1000 > Date.now();
}

/**
 * Send `store_wallet_policy` with a prepared write. Call this from a click
 * and nowhere else: the wallet opens on its first line, with nothing awaited
 * before it.
 */
export async function storePreparedPolicy(params: {
  coordinatorUrl: string;
  walletId: string;
  contractId: string;
  prepared: PreparedPolicyWrite;
  signAndSendTransaction: SignAndSendTransaction;
}): Promise<void> {
  const { coordinatorUrl, walletId, contractId, prepared, signAndSendTransaction } = params;
  const { write, depositYocto } = prepared;
  const action = actionCreators.functionCall(
    'store_wallet_policy',
    {
      wallet_pubkey: write.walletPubkey,
      encrypted_data: write.encryptedData,
      wallet_signature: write.walletSignature,
      version: write.version,
      locked: write.locked,
      valid_until: write.validUntil,
    },
    BigInt('100000000000000'),
    BigInt(depositYocto),
  );
  await signAndSendTransaction({ receiverId: contractId, actions: [action] });

  // The coordinator re-reads the chain; nothing of the policy is sent here.
  await fetch(`${coordinatorUrl}/wallet/v1/invalidate-cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet_id: walletId }),
  }).catch(() => {});
}

/**
 * The write a locked policy's approvers released, read off its request and
 * priced — ready for `storePreparedPolicy`. Opens no wallet.
 */
export async function prepareApprovedPolicy(params: {
  coordinatorUrl: string;
  apiKey: string;
  requestId: string;
  contractId: string;
  viewMethod: ViewMethod;
}): Promise<
  | { status: 'pending_approval' }
  | { status: 'failed'; error: string }
  | { status: 'ready'; prepared: PreparedPolicyWrite }
> {
  const { coordinatorUrl, apiKey, requestId, contractId, viewMethod } = params;
  const resp = await fetch(`${coordinatorUrl}/wallet/v1/requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `Could not read the request (HTTP ${resp.status})`);
  }
  const request = await resp.json();
  if (request.status === 'pending_approval') return { status: 'pending_approval' };
  if (request.status !== 'success') {
    return { status: 'failed', error: request.result?.error || `The request is ${request.status}` };
  }
  const result = request.result ?? {};
  const write: ApprovedPolicyWrite = {
    walletPubkey: String(result.wallet_pubkey),
    encryptedData: String(result.encrypted_data),
    walletSignature: String(result.wallet_signature),
    version: Number(result.version),
    locked: Boolean(result.locked),
    validUntil: Number(result.valid_until),
  };
  if (write.validUntil * 1000 < Date.now()) {
    return { status: 'failed', error: 'the approved signature expired before it was stored; submit the policy again' };
  }
  return { status: 'ready', prepared: { write, depositYocto: await policyStorageDeposit(contractId, viewMethod, write) } };
}

/** The contract's price for storing a write; 0.1 NEAR when the view cannot be read. */
async function policyStorageDeposit(contractId: string, viewMethod: ViewMethod, write: ApprovedPolicyWrite): Promise<string> {
  try {
    const cost = await viewMethod({
      contractId,
      method: 'estimate_wallet_policy_cost',
      args: { wallet_pubkey: write.walletPubkey, encrypted_data: write.encryptedData },
    });
    if (cost) return String(cost);
  } catch (e) {
    console.warn('estimate_wallet_policy_cost failed, using default:', e);
  }
  return '100000000000000000000000';
}
