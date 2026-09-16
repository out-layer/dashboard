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
    if (obj.WasmHash && typeof obj.WasmHash === 'object' && obj.WasmHash !== null) {
      const build = obj.WasmHash as { hash: string };
      return `🔒 Build ${build.hash.substring(0, 8)}…${build.hash.substring(build.hash.length - 8)}`;
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
  const wh = one('WasmHash');
  if (wh && typeof wh.hash === 'string') return { type: 'WasmHash', hash: wh.hash };
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
    case 'WasmHash':
      return { WasmHash: { hash: access.hash } };
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
  // Symmetric with `withGrant`: a revocation narrows WHO, and must not take the
  // row's build lock down with it. Revoking the only name inside
  // `And[Whitelist[agent], WasmHash]` collapses that AND and would otherwise
  // fall back to a bare whitelist — leaving the row open to any build.
  const locks = buildLocksOf(access);
  if (locks.length) {
    const pruned = revokeOnto(withoutBuildLocks(access), account, owner);
    return locks.reduce((tree, lock) => ({ Logic: { operator: 'And', conditions: [tree, lock] } }), pruned);
  }
  return revokeOnto(access, account, owner);
}

/** `withoutGrant`'s original body: the revocation itself, on a lock-free tree. */
function revokeOnto(access: unknown, account: string, owner: string | null): unknown {
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
  // A grant widens WHO may read, never WHAT may read. Any build lock on the row
  // is lifted off first and put back over the result, so the grantee is admitted
  // under the same lock as everyone else — `And[Or[owner, agent], WasmHash]`,
  // not `Or[And[owner, WasmHash], agent]`. Without this the one control that
  // hands a secret to an agent would be the one that unlocks it for them, and
  // the card would still show the padlock.
  const locks = buildLocksOf(access);
  const unlocked = locks.length ? withoutBuildLocks(access) : access;
  const granted = grantOnto(unlocked, owner, account, until_ns);
  return locks.reduce((tree, lock) => ({ Logic: { operator: 'And', conditions: [tree, lock] } }), granted);
}

/** Whether this subtree says something about builds and nothing else — every
 * leaf in it is a `WasmHash`. Such a subtree is the row's build RULE, whatever
 * its shape: a bare leaf, `Not{leaf}` ("any build but this one"), `Or[a, b]`
 * ("either of these two"). */
function isBuildOnly(node: unknown): boolean {
  const obj = asObj(node);
  if (!obj) return false;
  if (asObj(obj.WasmHash)) return true;
  const logic = logicOf(node);
  if (logic) return logic.conditions.length > 0 && logic.conditions.every(isBuildOnly);
  const not = asObj(obj.Not);
  if (not && 'condition' in not) return isBuildOnly(not.condition);
  return false;
}

/** The build rules in the tree: the LARGEST subtrees that are only about
 * builds, not the individual leaves inside them.
 *
 * Taking leaves instead is how a rule gets inverted. `Not{WasmHash(h)}` means
 * "any build but h"; lift the leaf out of it and put it back as a plain branch
 * and the row now means "only h" — the one build its owner excluded. Lifting
 * `Or[h1, h2]` leaf by leaf is the mirror: put both back as separate ANDs and
 * the row admits neither. */
function buildLocksOf(access: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (node: unknown) => {
    if (isBuildOnly(node)) {
      out.push(node);
      return;
    }
    const logic = logicOf(node);
    if (logic) {
      logic.conditions.forEach(walk);
      return;
    }
    const not = asObj(asObj(node)?.Not);
    if (not && 'condition' in not) walk(not.condition);
  };
  walk(access);
  return out;
}

/** The tree with every build rule removed and emptied nodes collapsed — an
 * `And` of nothing admits everyone, so none may be left behind.
 *
 * `'AllowAll'` when nothing else remains: a condition that was only ever a
 * build rule named nobody, so everyone was admitted on the builds it allowed.
 * The grant then narrows it exactly as it narrows any other `AllowAll` row. */
function withoutBuildLocks(access: unknown): unknown {
  const REMOVED = Symbol('removed');
  const prune = (node: unknown): unknown | typeof REMOVED => {
    if (isBuildOnly(node)) return REMOVED;
    const logic = logicOf(node);
    if (logic) {
      const kept = logic.conditions.map(prune).filter((c) => c !== REMOVED);
      if (kept.length === 0) return REMOVED;
      if (kept.length === 1) return kept[0];
      return { Logic: { operator: logic.operator, conditions: kept } };
    }
    const not = asObj(asObj(node)?.Not);
    if (not && 'condition' in not) {
      const inner = prune(not.condition);
      return inner === REMOVED ? REMOVED : { Not: { condition: inner } };
    }
    return node;
  };
  const pruned = prune(access);
  return pruned === REMOVED ? 'AllowAll' : pruned;
}

/** `withGrant`'s original body: the grant itself, on a tree carrying no lock. */
function grantOnto(access: unknown, owner: string | null, account: string, until_ns: string | null): unknown {
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
 * A stored condition, in the contract's shape, as the form carries it: rendered
 * when this UI knows the shape, kept verbatim (`kept`) when it does not — never
 * replaced by a default.
 */
export function carriedAccess(stored: unknown): { condition: AccessCondition | null; kept: unknown | null } {
  try {
    return { condition: convertAccessFromContractFormat(stored), kept: null };
  } catch {
    return { condition: null, kept: stored };
  }
}

/**
 * The condition a form starts from. `storedAccess` is the row a link or an
 * update lands on, in the contract's shape; when present it wins (see
 * `carriedAccess`).
 */
export function initialAccess(args: {
  sourceType: string;
  accountId: string | null | undefined;
  storedAccess?: unknown;
}): { condition: AccessCondition | null; kept: unknown | null } {
  if (args.storedAccess !== undefined) {
    return carriedAccess(args.storedAccess);
  }
  return {
    condition:
      args.sourceType === 'project' && args.accountId
        ? { type: 'Whitelist', accounts: [args.accountId] }
        : { type: 'AllowAll' },
    kept: null,
  };
}

/**
 * The stored condition a link carries, or nothing. A link names a project and
 * a profile whose row may already exist; that row's condition is the form's
 * starting point ONLY while the form still targets that row. Once the user
 * retargets — another project, another profile, another accessor kind — the
 * link's row is somebody else's, and the new row starts from the default,
 * never from a condition copied off a row it is not (an app's `AllowAll`
 * credential is the one most links land on).
 */
export function linkedAccessFor(args: {
  /** What the link named; both absent when the page was opened without one. */
  link: { projectId?: string; profile?: string };
  storedAccess: unknown;
  sourceType: string;
  projectId: string;
  profile: string;
}): unknown {
  if (args.storedAccess === undefined) return undefined;
  if (args.sourceType !== 'project') return undefined;
  // Compared as the save stores them — trimmed — so a stray space does not
  // read as a retarget and hand a new default to the link's own row.
  if ((args.link.projectId ?? '').trim() !== args.projectId.trim()) return undefined;
  if ((args.link.profile ?? '').trim() !== args.profile.trim()) return undefined;
  return args.storedAccess;
}

/** Shown beside the AllowAll choice. */
export const ALLOW_ALL_WARNING =
  "Anyone who names this secret can run the project with it. Right for an app's own credential named in its manifest; for a personal secret, use a whitelist.";

/** Existing project rows anyone can name — what the notice is about. */
export function openPersonalRows<T extends { accessor?: unknown; access?: unknown }>(secrets: T[]): T[] {
  return secrets.filter((s) => isProjectRow(s.accessor) && s.access === 'AllowAll');
}

/** The leaves a keystore can only answer by asking the chain. */
const CHAIN_READ_KINDS = ['NearBalance', 'FtBalance', 'NftOwned', 'DaoMember'] as const;

/**
 * The bounds a stored condition must satisfy, the same numbers the contract
 * stores by and the keystore judges by (`shared_tee_helpers::access_limits`,
 * `contract/src/secrets.rs` — change one and change all three).
 *
 * Chain reads are asked one after another from inside the enclave, so their
 * number bounds how long a shared keystore is held. Patterns are compiled
 * before a decrypt is judged, and a pattern's compiled size is not its text
 * size, so both how many and how long are bounded.
 */
export const MAX_CHAIN_READ_LEAVES = 5;
export const MAX_ACCOUNT_PATTERNS = 16;
export const MAX_ACCOUNT_PATTERN_BYTES = 4096;

type Counts = { chainReads: number; patterns: number; patternBytes: number };

function countLeaves(condition: unknown): Counts {
  const zero: Counts = { chainReads: 0, patterns: 0, patternBytes: 0 };
  if (!condition || typeof condition !== 'object') return zero;
  const node = condition as Record<string, unknown>;

  const pattern = (node.AccountPattern as { pattern?: unknown } | undefined)?.pattern;
  if (typeof pattern === 'string') {
    // Bytes, as the contract counts them.
    return { chainReads: 0, patterns: 1, patternBytes: new TextEncoder().encode(pattern).length };
  }
  if (CHAIN_READ_KINDS.some((kind) => kind in node)) return { ...zero, chainReads: 1 };

  const logic = node.Logic as { conditions?: unknown[] } | undefined;
  if (logic?.conditions) {
    return logic.conditions.reduce<Counts>((acc, c) => {
      const n = countLeaves(c);
      return {
        chainReads: acc.chainReads + n.chainReads,
        patterns: acc.patterns + n.patterns,
        patternBytes: acc.patternBytes + n.patternBytes,
      };
    }, zero);
  }
  const not = node.Not as { condition?: unknown } | undefined;
  if (not?.condition) return countLeaves(not.condition);
  return zero;
}

/** How many leaves of a stored condition ask the chain. */
export function chainReadLeaves(condition: unknown): number {
  return countLeaves(condition).chainReads;
}

/**
 * The sentence to show instead of signing when a "One build only" rule names
 * something the keystore could never match, or null when every such rule is a
 * SHA-256. The contract refuses these too — this only moves the refusal in
 * front of the wallet prompt instead of after it.
 */
export function buildHashRefusal(condition: unknown): string | null {
  let bad: string | null = null;
  const walk = (node: unknown) => {
    if (bad !== null) return;
    const obj = asObj(node);
    if (!obj) return;
    const build = asObj(obj.WasmHash);
    if (build) {
      const hash = typeof build.hash === 'string' ? build.hash : '';
      if (!/^[0-9a-f]{64}$/.test(hash)) bad = hash;
      return;
    }
    const logic = logicOf(node);
    if (logic) {
      logic.conditions.forEach(walk);
      return;
    }
    const not = asObj(obj.Not);
    if (not && 'condition' in not) walk(not.condition);
  };
  walk(condition);
  if (bad === null) return null;
  const named = bad === '' ? 'it is empty' : `"${bad}" is not`;
  return `A "One build only" rule must be the build's SHA-256 as 64 lowercase hex characters — ${named}. It is shown as "Executed binary" in an execution's details.`;
}

/**
 * The sentence to show instead of signing, or null when the condition is
 * within every bound. Said here so the refusal arrives before a wallet prompt
 * rather than as a contract panic after one.
 */
export function chainReadRefusal(condition: unknown): string | null {
  const { chainReads, patterns, patternBytes } = countLeaves(condition);
  if (chainReads > MAX_CHAIN_READ_LEAVES) {
    return `This condition asks the chain ${chainReads} times (balance, NFT or DAO checks); at most ${MAX_CHAIN_READ_LEAVES} are judged. Name accounts directly, or split the rule across profiles.`;
  }
  if (patterns > MAX_ACCOUNT_PATTERNS) {
    return `This condition holds ${patterns} account patterns; at most ${MAX_ACCOUNT_PATTERNS} are judged. Name accounts directly, or split the rule across profiles.`;
  }
  if (patternBytes > MAX_ACCOUNT_PATTERN_BYTES) {
    return `This condition's account patterns are ${patternBytes} bytes in all; at most ${MAX_ACCOUNT_PATTERN_BYTES} are judged. Shorten them, or name accounts directly.`;
  }
  return null;
}
