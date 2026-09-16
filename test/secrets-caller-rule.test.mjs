// A secret judged on the account that CALLED the contract, as the secrets
// screen handles it.
//
// `Predecessor{condition}` re-judges its condition on the calling account —
// the relaying contract, or the signer on a direct call. The screen writes one
// shape of it, `And[<who>, Predecessor{Whitelist[accounts]}]`, as "direct
// calls only" plus "also through these contracts". Every test here asks WHO
// is admitted FROM WHERE, through every edit the screen can make — because a
// grant that quietly let its grantee's calls come through any contract would
// undo the one thing the rule is for, and an edit that rewrote a rule under
// an OR or a NOT would invert what the owner wrote.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withGrant,
  withoutGrant,
  grantsOf,
  callersOf,
  namedAccounts,
  withCallers,
  emptyWhitelistRefusal,
  conditionRefusal,
  chainReadRefusal,
  buildHashRefusal,
  convertAccessFromContractFormat,
  convertAccessToContractFormat,
  formatAccessCondition,
} from '../app/secrets/components/utils.ts';

const OWNER = 'owner.near';
const AGENT = 'agent.near';
const DAO = 'dao.sputnik-dao.near';
const DEPUTY = 'deputy.near';
const STRANGER = 'stranger.near';
const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

const wl = (...accounts) => ({ Whitelist: { accounts } });
const via = (condition) => ({ Predecessor: { condition } });
const and = (...conditions) => ({ Logic: { operator: 'And', conditions } });
const or = (...conditions) => ({ Logic: { operator: 'Or', conditions } });
const not = (condition) => ({ Not: { condition } });
const lock = (hash = H) => ({ WasmHash: { hash } });

/** Does this tree admit a run signed by `caller`, called from `predecessor`,
 * on build `build`?
 *
 * A reimplementation of the keystore's evaluator, deliberately: asserting on
 * the SHAPE of an edited tree would pass for any shape the edit happens to
 * produce. What matters is the set of (caller, predecessor) pairs admitted, so
 * that is what these tests compare. Mirrors
 * `keystore-worker/src/types.rs::evaluate` for the leaves a screen can write;
 * an unknown leaf throws rather than guessing. An empty `Logic` throws too:
 * the contract refuses to store one, so no stored tree carries it. */
function admits(node, caller, predecessor, build = H) {
  if (node === 'AllowAll') return true;
  if (node?.Whitelist) return node.Whitelist.accounts.includes(caller);
  if (node?.WasmHash) return node.WasmHash.hash.toLowerCase() === build.toLowerCase();
  if (node?.ValidUntil) return true; // far future in every tree here
  if (node?.Not) return !admits(node.Not.condition, caller, predecessor, build);
  if (node?.Predecessor) return admits(node.Predecessor.condition, predecessor, predecessor, build);
  if (node?.Logic) {
    const { operator, conditions } = node.Logic;
    if (conditions.length === 0) throw new Error('an empty Logic node is refused by the contract');
    return operator === 'And'
      ? conditions.every((c) => admits(c, caller, predecessor, build))
      : conditions.some((c) => admits(c, caller, predecessor, build));
  }
  throw new Error(`unknown leaf: ${JSON.stringify(node)}`);
}

/** Every (signer, calling account) pair among a fixed cast that the tree admits. */
const CAST = [OWNER, AGENT, DAO, DEPUTY, STRANGER];
function admittedPairs(tree, build = H) {
  const out = [];
  for (const signer of CAST) for (const from of CAST) if (admits(tree, signer, from, build)) out.push(`${signer}<-${from}`);
  return out.sort();
}
const pair = (signer, from) => `${signer}<-${from}`;

// ── the shape the screen writes ─────────────────────────────────────────────

test('C1 direct calls only: the owner reads directly and through nobody', () => {
  const tree = withCallers(wl(OWNER), [OWNER]);
  assert.deepEqual(admittedPairs(tree), [pair(OWNER, OWNER)]);
  assert.ok(!admits(tree, OWNER, DEPUTY), 'a relay under the owner’s signature is refused');
});

test('C1 the rule is read back as what it is', () => {
  const tree = withCallers(wl(OWNER), [OWNER]);
  assert.deepEqual(callersOf(tree), { accounts: [OWNER], custom: false });
  assert.equal(callersOf(wl(OWNER)), null, 'no rule, no callers');
  assert.match(formatAccessCondition(tree), /Called from/);
});

test('C2 also through a DAO: the owner reads directly and through the DAO, and through nothing else', () => {
  const tree = withCallers(wl(OWNER), [OWNER, DAO]);
  assert.deepEqual(admittedPairs(tree), [pair(OWNER, DAO), pair(OWNER, OWNER)]);
  assert.deepEqual(callersOf(tree).accounts, [OWNER, DAO]);
});

test('C3 turning the rule off restores the tree it was put on', () => {
  const base = or(wl(OWNER), and(wl(AGENT), { ValidUntil: { until_ns: '9' } }));
  const on = withCallers(base, [OWNER, AGENT]);
  const off = withCallers(on, []);
  assert.deepEqual(admittedPairs(off), admittedPairs(base));
  assert.equal(callersOf(off), null);
  assert.deepEqual(off, base, 'the very tree, not merely an equivalent one');
});

test('C4 writing the rule is idempotent in SHAPE — a row does not grow per edit', () => {
  const once = withCallers(and(wl(OWNER), lock()), [OWNER, DAO]);
  const twice = withCallers(once, [OWNER, DAO]);
  assert.deepEqual(twice, once);
  const granted = withCallers(withGrant(once, OWNER, AGENT, null), [OWNER, AGENT, DAO]);
  assert.deepEqual(withCallers(granted, [OWNER, AGENT, DAO]), granted);
});

// ── grants under the rule ───────────────────────────────────────────────────

test('G1 a grant admits the grantee only under the same calling-account rule', () => {
  const direct = withCallers(wl(OWNER), [OWNER]);
  const granted = withGrant(direct, OWNER, AGENT, null);
  // The grantee is named as a reader, and the rule still stands: the agent's
  // own calls are admitted only once the rule names it too — the screen does
  // that step (`followingCallers`); this helper alone must not widen FROM WHERE.
  assert.ok(!admits(granted, AGENT, DEPUTY), 'the grantee cannot come through a relay');
  assert.ok(!admits(granted, OWNER, DEPUTY), 'nor can the owner, still');
  assert.deepEqual(grantsOf(granted, OWNER).map((g) => g.account), [AGENT]);
  const followed = withCallers(granted, [...namedAccounts(granted, OWNER)]);
  // What "direct calls only" means for TWO named accounts, exactly: each may
  // call directly, and each may come through the other's contract — the list
  // names accounts, not "the signer itself". Nobody outside the list, from
  // anywhere. A rule that pinned the calling account to the signer would be
  // a different leaf; this one is a list, and the test says so.
  assert.deepEqual(admittedPairs(followed), [pair(AGENT, AGENT), pair(AGENT, OWNER), pair(OWNER, AGENT), pair(OWNER, OWNER)]);
});

test('G2 a revocation keeps the rule, and the revoked account leaves the calling list too', () => {
  const tree = withCallers(or(wl(OWNER), wl(AGENT)), [OWNER, AGENT]);
  const revoked = withoutGrant(tree, AGENT, OWNER);
  for (const from of CAST) assert.ok(!admits(revoked, AGENT, from), `agent still reads from ${from}`);
  assert.ok(admits(revoked, OWNER, OWNER));
  assert.ok(!admits(revoked, OWNER, DEPUTY), 'the rule survived the revocation');
  // The helper alone, with no screen to resync it: a revoked grantee that is
  // a contract must not keep relaying the owner's calls.
  assert.ok(!admits(revoked, OWNER, AGENT), 'the revoked account can no longer relay the owner');
  assert.deepEqual(callersOf(revoked).accounts, [OWNER]);
});

test('G3 revoking the ONLY named account keeps the rule, and the owner can still read', () => {
  const tree = withCallers(wl(AGENT), [AGENT]);
  const revoked = withoutGrant(tree, AGENT, OWNER);
  assert.notEqual(callersOf(revoked), null, 'the fallback must not be a bare whitelist');
  assert.ok(!admits(revoked, OWNER, DEPUTY));
  assert.ok(admits(revoked, OWNER, OWNER), 'the owner is not locked out of their own row');
  assert.deepEqual(admittedPairs(revoked), [pair(OWNER, OWNER)]);
});

test('G4 the calling accounts are never listed as grantees or readers', () => {
  const tree = withCallers(wl(OWNER), [OWNER, DAO]);
  assert.deepEqual(grantsOf(tree, OWNER), [], 'a DAO named as a caller is not a reader');
  assert.deepEqual(namedAccounts(tree, OWNER), [OWNER]);
});

test('G5 namedAccounts lists what the tree names — the owner only when named', () => {
  assert.deepEqual(namedAccounts(wl(AGENT), OWNER), [AGENT]);
  assert.deepEqual(namedAccounts(or(wl(AGENT), wl(OWNER)), OWNER), [OWNER, AGENT], 'the owner first');
  assert.deepEqual(namedAccounts('AllowAll', OWNER), []);
  assert.deepEqual(namedAccounts({ AccountPattern: { pattern: '.*' } }, OWNER), []);
  assert.deepEqual(namedAccounts(and(wl(OWNER), not(wl(STRANGER))), OWNER), [OWNER], 'a denylist names nobody');
});

// ── beside a build lock ─────────────────────────────────────────────────────

test('B1 a calling-account rule and a build lock coexist through every edit', () => {
  const both = withCallers(and(wl(OWNER), lock()), [OWNER]);
  assert.ok(admits(both, OWNER, OWNER, H));
  assert.ok(!admits(both, OWNER, OWNER, H2), 'the lock still holds');
  assert.ok(!admits(both, OWNER, DEPUTY, H), 'the rule still holds');
  const granted = withGrant(both, OWNER, AGENT, null);
  assert.ok(!admits(granted, AGENT, AGENT, H2), 'a grant did not unlock the row');
  assert.ok(!admits(granted, AGENT, DEPUTY, H), 'nor open it to relays');
  const off = withCallers(granted, []);
  assert.ok(!admits(off, AGENT, AGENT, H2), 'turning the rule off kept the lock');
  assert.ok(admits(off, AGENT, DEPUTY, H), 'and only the rule went');
});

// ── rules that are not on the spine are left exactly where they are ─────────

test('S1 a wrapper under an OR is a branch, not a rule: custom, and a grant keeps the OR', () => {
  // "The owner from anywhere, OR anyone through the DAO."
  const tree = or(wl(OWNER), via(wl(DAO)));
  assert.deepEqual(callersOf(tree), { accounts: [], custom: true });
  const before = admittedPairs(tree);
  const granted = withGrant(tree, OWNER, AGENT, null);
  const after = admittedPairs(granted);
  // Everything admitted before is admitted after, and the only additions are
  // the agent's own.
  for (const p of before) assert.ok(after.includes(p), `${p} was lost by the grant`);
  for (const p of after) assert.ok(before.includes(p) || p.startsWith(`${AGENT}<-`), `${p} appeared from nowhere`);
  assert.ok(admits(granted, OWNER, DEPUTY), 'the owner still reads from anywhere');
  assert.ok(admits(granted, STRANGER, DAO), 'anyone still reads through the DAO');
  // And a revocation restores the tree a grant was made on.
  assert.deepEqual(admittedPairs(withoutGrant(granted, AGENT, OWNER)), before);
});

test('S2 a wrapper under a NOT is a branch, not a rule: De Morgan is not inverted', () => {
  // "Not the stranger, and not through the deputy."
  const tree = not(or(wl(STRANGER), via(wl(DEPUTY))));
  assert.deepEqual(callersOf(tree), { accounts: [], custom: true });
  assert.ok(!admits(tree, OWNER, DEPUTY), 'precondition: through the deputy is excluded');
  const before = admittedPairs(tree);
  const granted = withGrant(tree, OWNER, AGENT, null);
  const after = admittedPairs(granted);
  assert.ok(!admits(granted, OWNER, DEPUTY), 'a grant did not admit the one caller the owner excluded');
  assert.ok(admits(granted, OWNER, OWNER), 'the owner still reads directly');
  assert.ok(admits(granted, AGENT, AGENT), 'and the grantee reads');
  // The grantee's branch is its own: a rule the screen does not lift is not
  // extended over a grantee either. The screen reports the rule as custom, so
  // the owner sees it and puts the grantee under it in Full condition.
  for (const p of before) assert.ok(after.includes(p), `${p} was lost by the grant`);
  for (const p of after) assert.ok(before.includes(p) || p.startsWith(`${AGENT}<-`), `${p} appeared from nowhere`);
});

test('S3 two wrappers ANDed admit nobody, and stay that way — never merged into "either"', () => {
  const tree = and(wl(OWNER), via(wl(DAO)), via(wl(DEPUTY)));
  assert.deepEqual(admittedPairs(tree), [], 'precondition: unsatisfiable');
  assert.deepEqual(callersOf(tree), { accounts: [], custom: true });
  const granted = withGrant(tree, OWNER, AGENT, null);
  assert.deepEqual(admittedPairs(granted), [], 'a grant onto "nobody" admits nobody');
});

test('S4 a custom rule on the spine beside a plain one is custom, and both survive a grant', () => {
  const custom = via({ DaoMember: { dao_contract: DAO, role: 'council' } });
  const tree = and(wl(OWNER), custom, via(wl(DAO)));
  assert.deepEqual(callersOf(tree), { accounts: [], custom: true });
  const granted = withGrant(tree, OWNER, AGENT, null);
  const rules = JSON.stringify(granted);
  assert.ok(rules.includes(JSON.stringify(custom)), 'the custom rule travels intact');
  assert.ok(rules.includes(JSON.stringify(via(wl(DAO)))), 'and so does the plain one');
  assert.deepEqual(grantsOf(granted, OWNER).map((g) => g.account), [AGENT]);
});

test('S5 a custom rule alone is reported as custom and its verdict is the evaluator’s', () => {
  const custom = and(wl(OWNER), via(not(wl(DEPUTY))));
  assert.deepEqual(callersOf(custom), { accounts: [], custom: true });
  assert.ok(!admits(custom, OWNER, DEPUTY));
  assert.ok(admits(custom, OWNER, DAO));
  const negated = and(wl(OWNER), not(via(wl(DEPUTY))));
  assert.deepEqual(grantsOf(negated, OWNER), [], 'a negated rule names no grantee');
  const granted = withGrant(negated, OWNER, AGENT, null);
  assert.ok(admits(granted, AGENT, AGENT));
  assert.ok(!admits(granted, AGENT, DEPUTY), 'the negation still refuses the deputy for the grantee');
});

// ── an empty rule is refused before signing ─────────────────────────────────

test('E1 a whitelist naming nobody is refused before the wallet prompt, wherever it sits', () => {
  const empty = and(wl(OWNER), via(wl()));
  assert.deepEqual(admittedPairs(empty), [], 'precondition: it admits no call');
  assert.deepEqual(callersOf(empty), { accounts: [], custom: true }, 'never summarised as "direct calls only"');
  assert.match(emptyWhitelistRefusal(empty), /names nobody/);
  assert.equal(emptyWhitelistRefusal(withCallers(wl(OWNER), [OWNER])), null);
  for (const shape of [
    via(and(wl())),
    via(or(wl())),
    via(via(wl())),
    wl(),
    and(wl(OWNER), wl()),
    and(wl(OWNER), or(via(wl()), wl(AGENT))),
  ]) {
    assert.match(conditionRefusal(shape) ?? '', /names nobody/, `not found in ${JSON.stringify(shape)}`);
  }
  // Under a NOT an empty whitelist excludes nobody — a different mistake, not this one.
  assert.equal(conditionRefusal(and(wl(OWNER), not(wl()))), null);
  assert.deepEqual(withCallers(wl(OWNER), []), wl(OWNER), 'the screen writes no rule for no accounts');
});

test('E2 a rule that omits a named reader is not "direct calls only", and is never followed', () => {
  // What `--via dao` alone writes, and what the builder can write.
  const tree = and(wl(OWNER, AGENT), via(wl(DAO)));
  assert.ok(!admits(tree, OWNER, OWNER), 'precondition: the owner cannot call directly');
  assert.deepEqual(callersOf(tree), { accounts: [], custom: true });
  // A grant or a revocation on it keeps every pair it admitted, adds only the
  // grantee's, and admits no new call for the owner.
  const before = admittedPairs(tree);
  const granted = withGrant(tree, OWNER, STRANGER, null);
  const after = admittedPairs(granted);
  for (const p of before) assert.ok(after.includes(p), `${p} lost`);
  for (const p of after) assert.ok(before.includes(p) || p.startsWith(`${STRANGER}<-`), `${p} appeared`);
  assert.ok(!admits(granted, OWNER, OWNER), 'the owner still cannot call directly');
  const revoked = withoutGrant(tree, AGENT, OWNER);
  assert.ok(!admits(revoked, OWNER, OWNER), 'nor after a revocation');
  // A rule over a tree that names nobody has no readers to be direct about.
  assert.deepEqual(callersOf(via(wl(OWNER))), { accounts: [], custom: true });
  assert.deepEqual(callersOf(and({ AccountPattern: { pattern: '.*' } }, via(wl(OWNER)))), { accounts: [], custom: true });
});

test('B2 a build lock under an OR is that branch\'s, and a grant does not lock the other', () => {
  const tree = or(and(wl(OWNER), lock()), wl(AGENT));
  assert.ok(admits(tree, AGENT, AGENT, H2), 'precondition: the agent reads on any build');
  const granted = withGrant(tree, OWNER, STRANGER, null);
  assert.ok(admits(granted, AGENT, AGENT, H2), 'the agent still reads on any build');
  assert.ok(!admits(granted, OWNER, OWNER, H2), 'the owner is still locked');
  assert.ok(admits(granted, STRANGER, STRANGER, H2), 'the grantee joins the open branch');
  assert.deepEqual(admittedPairs(withoutGrant(granted, STRANGER, OWNER), H2), admittedPairs(tree, H2));
});

// ── round trips and bounds ──────────────────────────────────────────────────

test('R1 the condition survives a round trip through both converters', () => {
  const tree = withCallers(or(wl(OWNER), wl(AGENT)), [OWNER, AGENT, DAO]);
  assert.deepEqual(convertAccessToContractFormat(convertAccessFromContractFormat(tree)), tree);
  const nested = via(via(wl(DEPUTY)));
  assert.deepEqual(convertAccessToContractFormat(convertAccessFromContractFormat(nested)), nested);
});

test('R2 leaves inside the rule count towards the bounds', () => {
  const six = Array.from({ length: 6 }, () => ({ NearBalance: { operator: 'Gte', value: '1' } }));
  assert.notEqual(chainReadRefusal(via(or(...six))), null, 'six chain reads inside the rule are refused');
  assert.notEqual(buildHashRefusal(via(lock('nope'))), null, 'a malformed build inside the rule is found');
});

test('R3 an AllowAll row with a rule is the rule alone', () => {
  const tree = withCallers('AllowAll', [OWNER]);
  assert.deepEqual(tree, via(wl(OWNER)));
  assert.equal(withCallers(tree, []), 'AllowAll');
});

test('R4 a nested wrapper is one rule about one account, and reads as custom', () => {
  const tree = and(wl(OWNER), via(via(wl(DEPUTY))));
  assert.deepEqual(admittedPairs(tree), [pair(OWNER, DEPUTY)]);
  assert.deepEqual(callersOf(tree), { accounts: [], custom: true });
});
