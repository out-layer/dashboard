import type { AccessCondition, ComparisonOperator, LogicOperator } from './types';

// Format access condition for display
export function formatAccessCondition(access: unknown): string {
  if (typeof access === 'string' && access === 'AllowAll') {
    return '🌍 Allow all accounts';
  }

  if (typeof access === 'object' && access !== null) {
    const obj = access as Record<string, unknown>;

    if (obj.Whitelist && typeof obj.Whitelist === 'object' && obj.Whitelist !== null) {
      const whitelist = obj.Whitelist as { accounts: string[] };
      const accounts = whitelist.accounts.slice(0, 2).join(', ');
      const more = whitelist.accounts.length > 2 ? `... +${whitelist.accounts.length - 2}` : '';
      return `👥 Whitelist: ${accounts}${more}`;
    }
    if (obj.AccountPattern && typeof obj.AccountPattern === 'object' && obj.AccountPattern !== null) {
      const pattern = obj.AccountPattern as { pattern: string };
      return `🔍 Pattern: ${pattern.pattern}`;
    }
    if (obj.NearBalance && typeof obj.NearBalance === 'object' && obj.NearBalance !== null) {
      const nearBalance = obj.NearBalance as { value: string; operator: string };
      const nearAmount = (BigInt(nearBalance.value) / BigInt(1e24)).toString();
      return `💰 NEAR balance ${nearBalance.operator} ${nearAmount} NEAR`;
    }
    if (obj.FtBalance && typeof obj.FtBalance === 'object' && obj.FtBalance !== null) {
      const ftBalance = obj.FtBalance as { contract: string; operator: string; value: string };
      return `🪙 FT ${ftBalance.contract}: balance ${ftBalance.operator} ${ftBalance.value}`;
    }
    if (obj.NftOwned && typeof obj.NftOwned === 'object' && obj.NftOwned !== null) {
      const nftOwned = obj.NftOwned as { contract: string; token_id?: string | null };
      if (nftOwned.token_id) {
        return `🖼️ Owns NFT ${nftOwned.contract}#${nftOwned.token_id}`;
      }
      return `🖼️ Owns NFT from ${nftOwned.contract}`;
    }
    if (obj.DaoMember && typeof obj.DaoMember === 'object' && obj.DaoMember !== null) {
      const daoMember = obj.DaoMember as { dao_contract: string; role: string };
      return `🏛️ DAO member: ${daoMember.dao_contract} (${daoMember.role})`;
    }
    if (obj.ValidUntil && typeof obj.ValidUntil === 'object' && obj.ValidUntil !== null) {
      const until = obj.ValidUntil as { until_ns: string };
      return `⏳ Until ${nsToIsoUtc(until.until_ns)}`;
    }
    if (obj.Logic && typeof obj.Logic === 'object' && obj.Logic !== null) {
      const logic = obj.Logic as { operator: string; conditions: unknown[] };
      const joiner = logic.operator === 'And' ? ' AND ' : ' OR ';
      return `(${logic.conditions.map(formatAccessCondition).join(joiner)})`;
    }
    if (obj.Not && typeof obj.Not === 'object' && obj.Not !== null) {
      const not = obj.Not as { condition: unknown };
      return `🚫 NOT ${formatAccessCondition(not.condition)}`;
    }
  }

  return 'Unknown condition';
}

/** Nanoseconds since the epoch (as the contract stores them) → `YYYY-MM-DDTHH:MM:SSZ`. */
export function nsToIsoUtc(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / BigInt(1_000_000));
    return new Date(ms).toISOString().slice(0, 19) + 'Z';
  } catch {
    return ns;
  }
}

/** `datetime-local` input value, read as UTC → nanoseconds string. Returns null for an unreadable value. */
export function localInputToNs(value: string): string | null {
  const ms = Date.parse(value.endsWith('Z') ? value : value + 'Z');
  if (Number.isNaN(ms) || ms < 0) return null;
  return (BigInt(ms) * BigInt(1_000_000)).toString();
}

/** Nanoseconds string → the value a `datetime-local` input shows (UTC wall clock). */
export function nsToLocalInput(ns: string): string {
  try {
    const ms = Number(BigInt(ns) / BigInt(1_000_000));
    return new Date(ms).toISOString().slice(0, 19);
  } catch {
    return '';
  }
}

/**
 * Contract format → UI condition. Throws on a shape this UI does not know, so a
 * caller can keep the stored value as-is rather than silently replace it —
 * re-storing an unrecognised condition as `AllowAll` would widen it.
 */
export function convertAccessFromContractFormat(access: unknown): AccessCondition {
  if (access === 'AllowAll') return { type: 'AllowAll' };
  if (typeof access !== 'object' || access === null) {
    throw new Error('access condition is neither "AllowAll" nor an object');
  }
  const obj = access as Record<string, unknown>;
  const one = (key: string) => (obj[key] && typeof obj[key] === 'object' ? (obj[key] as Record<string, unknown>) : null);
  const wl = one('Whitelist');
  if (wl && Array.isArray(wl.accounts)) return { type: 'Whitelist', accounts: wl.accounts.map(String) };
  const ap = one('AccountPattern');
  if (ap && typeof ap.pattern === 'string') return { type: 'AccountPattern', pattern: ap.pattern };
  const nb = one('NearBalance');
  if (nb && typeof nb.value === 'string') return { type: 'NearBalance', operator: nb.operator as ComparisonOperator, value: nb.value };
  const fb = one('FtBalance');
  if (fb && typeof fb.contract === 'string') {
    return { type: 'FtBalance', contract: fb.contract, operator: fb.operator as ComparisonOperator, value: String(fb.value ?? '') };
  }
  const nft = one('NftOwned');
  if (nft && typeof nft.contract === 'string') {
    return { type: 'NftOwned', contract: nft.contract, token_id: typeof nft.token_id === 'string' ? nft.token_id : null };
  }
  const dao = one('DaoMember');
  if (dao && typeof dao.dao_contract === 'string') return { type: 'DaoMember', dao_contract: dao.dao_contract, role: String(dao.role ?? '') };
  const vu = one('ValidUntil');
  if (vu && (typeof vu.until_ns === 'string' || typeof vu.until_ns === 'number')) return { type: 'ValidUntil', until_ns: String(vu.until_ns) };
  const logic = one('Logic');
  if (logic && Array.isArray(logic.conditions)) {
    return {
      type: 'Logic',
      operator: logic.operator as LogicOperator,
      conditions: logic.conditions.map(convertAccessFromContractFormat),
    };
  }
  const not = one('Not');
  if (not && 'condition' in not) return { type: 'Not', condition: convertAccessFromContractFormat(not.condition) };
  throw new Error(`unknown access condition: ${Object.keys(obj).join(', ')}`);
}

// Convert UI access condition to contract format (PascalCase enums)
export function convertAccessToContractFormat(access: AccessCondition): unknown {
  switch (access.type) {
    case 'AllowAll':
      return 'AllowAll';
    case 'Whitelist':
      return { Whitelist: { accounts: access.accounts } };
    case 'AccountPattern':
      return { AccountPattern: { pattern: access.pattern } };
    case 'NearBalance':
      return { NearBalance: { operator: access.operator, value: access.value } };
    case 'FtBalance':
      return { FtBalance: { contract: access.contract, operator: access.operator, value: access.value } };
    case 'NftOwned':
      return { NftOwned: { contract: access.contract, token_id: access.token_id } };
    case 'DaoMember':
      return { DaoMember: { dao_contract: access.dao_contract, role: access.role } };
    case 'Logic':
      return {
        Logic: {
          operator: access.operator,
          conditions: access.conditions.map(cond => convertAccessToContractFormat(cond))
        }
      };
    case 'Not':
      return { Not: { condition: convertAccessToContractFormat(access.condition) } };
    case 'ValidUntil':
      return { ValidUntil: { until_ns: access.until_ns } };
    default:
      // Never widen by accident: an unknown shape is a bug, not "everyone".
      throw new Error('unknown access condition type');
  }
}

// ── Grants: a whitelist entry read as "who was handed this secret" ──────────
//
// A grant is an account the condition admits BY NAME other than the owner;
// the contract knows nothing of grants, only of the tree. These read and edit
// the tree in the one shape the interfaces write — a whitelist, or an
// `And[Whitelist[agent], ValidUntil]` for a grant that lapses — and leave every
// other leaf exactly as it is.

/** One account a condition admits by name, with the time limit an enclosing
 * AND puts on it (`null`: none). */
export interface Grant {
  account: string;
  until_ns: string | null;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (typeof v === 'object' && v !== null ? (v as Obj) : null);
const whitelistAccounts = (v: unknown): string[] | null => {
  const wl = asObj(asObj(v)?.Whitelist);
  return wl && Array.isArray(wl.accounts) ? wl.accounts.map(String) : null;
};
const logicOf = (v: unknown): { operator: string; conditions: unknown[] } | null => {
  const l = asObj(asObj(v)?.Logic);
  return l && Array.isArray(l.conditions) ? { operator: String(l.operator), conditions: l.conditions } : null;
};
const untilOf = (v: unknown): string | null => {
  const u = asObj(asObj(v)?.ValidUntil);
  return u && (typeof u.until_ns === 'string' || typeof u.until_ns === 'number') ? String(u.until_ns) : null;
};
const earlier = (a: string | null, b: string | null): string | null => {
  if (a === null) return b;
  if (b === null) return a;
  try {
    return BigInt(a) <= BigInt(b) ? a : b;
  } catch {
    return a;
  }
};
const whitelist = (accounts: string[]): unknown => ({ Whitelist: { accounts } });

/** Every account the condition names other than `owner`, each with the
 * earliest `ValidUntil` of the ANDs above it. A whitelist under NOT is a
 * denylist and names nobody. */
export function grantsOf(access: unknown, owner: string | null): Grant[] {
  const out: Grant[] = [];
  const walk = (node: unknown, until: string | null) => {
    const accounts = whitelistAccounts(node);
    if (accounts) {
      for (const account of accounts) if (account !== owner) out.push({ account, until_ns: until });
      return;
    }
    const logic = logicOf(node);
    if (!logic) return;
    let limit = until;
    if (logic.operator === 'And') for (const c of logic.conditions) limit = earlier(limit, untilOf(c));
    for (const c of logic.conditions) walk(c, limit);
  };
  walk(access, null);
  return out;
}

/** The condition with every grant to `account` removed. A whitelist that
 * empties disappears; an AND it sat in admitted nobody else through it and
 * disappears too; an OR left with one branch becomes that branch. A tree
 * that empties entirely falls back to the owner alone — never to everyone. */
export function withoutGrant(access: unknown, account: string, owner: string | null): unknown {
  const REMOVED = Symbol('removed');
  const prune = (node: unknown): unknown | typeof REMOVED => {
    const accounts = whitelistAccounts(node);
    if (accounts) {
      const kept = accounts.filter((a) => a !== account);
      return kept.length ? whitelist(kept) : REMOVED;
    }
    const logic = logicOf(node);
    if (!logic) return node;
    const children = logic.conditions.map(prune);
    if (logic.operator === 'And') {
      return children.some((c) => c === REMOVED) ? REMOVED : { Logic: { operator: 'And', conditions: children } };
    }
    const alive = children.filter((c) => c !== REMOVED);
    if (alive.length === 0) return REMOVED;
    if (alive.length === 1) return alive[0];
    return { Logic: { operator: 'Or', conditions: alive } };
  };
  const pruned = prune(access);
  return pruned === REMOVED ? whitelist(owner ? [owner] : []) : pruned;
}

/** The condition with `account` admitted — for good, or until `until_ns`. An
 * earlier grant to the same account is replaced. On an `AllowAll` row, where
 * everyone reads already, a grant means "the owner and the agents named", so
 * it starts from the owner alone. */
export function withGrant(access: unknown, owner: string | null, account: string, until_ns: string | null): unknown {
  const base = access === 'AllowAll' ? whitelist(owner ? [owner] : []) : withoutGrant(access, account, owner);
  const grant =
    until_ns === null
      ? whitelist([account])
      : { Logic: { operator: 'And', conditions: [whitelist([account]), { ValidUntil: { until_ns } }] } };
  const accounts = whitelistAccounts(base);
  if (until_ns === null && accounts) return whitelist([...accounts, account]);
  const logic = logicOf(base);
  if (logic && logic.operator === 'Or') {
    const branches = [...logic.conditions];
    const open = until_ns === null ? branches.findIndex((c) => whitelistAccounts(c) !== null) : -1;
    if (open >= 0) branches[open] = whitelist([...(whitelistAccounts(branches[open]) ?? []), account]);
    else branches.push(grant);
    return { Logic: { operator: 'Or', conditions: branches } };
  }
  return { Logic: { operator: 'Or', conditions: [base, grant] } };
}

// ── A custody wallet's account, from its public key ─────────────────────────

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** `ed25519:<base58 public key>` → the implicit account it is on NEAR (the
 * key's 32 bytes as hex). This is the account that pays for a custody wallet's
 * calls, and so the one a grant must name. `null` for any other key. */
export function implicitAccountOf(pubkey: string): string | null {
  const colon = pubkey.indexOf(':');
  const curve = colon >= 0 ? pubkey.slice(0, colon) : 'ed25519';
  const encoded = colon >= 0 ? pubkey.slice(colon + 1) : pubkey;
  if (curve !== 'ed25519' || encoded.length === 0) return null;
  let n = BigInt(0);
  for (const ch of encoded) {
    const digit = BASE58.indexOf(ch);
    if (digit < 0) return null;
    n = n * BigInt(58) + BigInt(digit);
  }
  let leading = 0;
  for (const ch of encoded) {
    if (ch !== '1') break;
    leading += 1;
  }
  let hex = n === BigInt(0) ? '' : n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  hex = '00'.repeat(leading) + hex;
  return hex.length === 64 ? hex : null;
}

// ── the screen's access decisions, pure ──────────────────────────────────────
//
// Kept here, beside the format converters, so each can be asserted as the plan
// words it without rendering:
//   - a NEW row under a project admits only the connected account until its
//     owner says otherwise; repository- and hash-bound rows are an app's own
//     and stay open;
//   - a row that EXISTS keeps the condition it has — replacing its values must
//     neither widen a whitelist to everyone nor narrow an app's AllowAll
//     credential to its author;
//   - the AllowAll choice carries a warning, because anyone who names such a
//     row can run the project with it;
//   - existing project rows stored AllowAll are the subjects of a one-time
//     notice; the rows themselves are never changed by the screen.

const isProjectRow = (accessor: unknown): boolean =>
  typeof accessor === 'object' && accessor !== null && 'Project' in accessor;

/**
 * The condition a form starts from. `storedAccess` is the row a link or an
 * update lands on, in the contract's shape; when present it wins, and a shape
 * this UI cannot render is kept verbatim (`kept`) rather than replaced.
 */
export function initialAccess(args: {
  sourceType: string;
  accountId: string | null | undefined;
  storedAccess?: unknown;
}): { condition: AccessCondition | null; kept: unknown | null } {
  if (args.storedAccess !== undefined) {
    try {
      return { condition: convertAccessFromContractFormat(args.storedAccess), kept: null };
    } catch {
      return { condition: null, kept: args.storedAccess };
    }
  }
  return {
    condition:
      args.sourceType === 'project' && args.accountId
        ? { type: 'Whitelist', accounts: [args.accountId] }
        : { type: 'AllowAll' },
    kept: null,
  };
}

/** Shown beside the AllowAll choice. */
export const ALLOW_ALL_WARNING =
  "Anyone who names this secret can run the project with it. Right for an app's own credential named in its manifest; for a personal secret, use a whitelist.";

/** Existing project rows anyone can name — what the notice is about. */
export function openPersonalRows<T extends { accessor?: unknown; access?: unknown }>(secrets: T[]): T[] {
  return secrets.filter((s) => isProjectRow(s.accessor) && s.access === 'AllowAll');
}
