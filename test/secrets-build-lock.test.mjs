// A secret locked to one build, as the secrets screen handles it.
//
// The `WasmHash` condition says "only a run of these exact wasm bytes may read
// this row". Every test here asks one question of a tree: WHO is admitted on a
// build other than the locked one. The answer must be "nobody", through every
// edit the screen can make — because a control that widens that set while the
// card still shows a padlock is worse than no lock at all.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withGrant,
  withoutGrant,
  grantsOf,
  buildHashRefusal,
  convertAccessFromContractFormat,
  convertAccessToContractFormat,
  formatAccessCondition,
} from '../app/secrets/components/utils.ts';

const OWNER = 'owner.near';
const AGENT = 'agent.near';
const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);

const lock = (hash = H) => ({ WasmHash: { hash } });
const wl = (...accounts) => ({ Whitelist: { accounts } });
const and = (...conditions) => ({ Logic: { operator: 'And', conditions } });
const or = (...conditions) => ({ Logic: { operator: 'Or', conditions } });

/** Does this tree admit `caller` when the running build is `build`?
 *
 * A reimplementation of the keystore's evaluator, deliberately: asserting on
 * the SHAPE of an edited tree would pass for any shape the edit happens to
 * produce, which is how the grant bug survived review. What matters is the set
 * of (caller, build) pairs admitted, so that is what these tests compare.
 * Mirrors `keystore-worker/src/types.rs::evaluate` for the leaves a screen can
 * write; an unknown leaf throws rather than guessing. */
function admits(node, caller, build) {
  if (node === 'AllowAll') return true;
  if (node?.Whitelist) return node.Whitelist.accounts.includes(caller);
  if (node?.WasmHash) return node.WasmHash.hash.toLowerCase() === build.toLowerCase();
  if (node?.ValidUntil) return true; // far-future deadlines only in these trees
  if (node?.Not) return !admits(node.Not.condition, caller, build);
  if (node?.Logic) {
    const { operator, conditions } = node.Logic;
    // An `And` of nothing is TRUE and an `Or` of nothing is FALSE, as in the
    // keystore — which is why an edit must never leave an emptied node behind.
    return operator === 'And'
      ? conditions.every((c) => admits(c, caller, build))
      : conditions.some((c) => admits(c, caller, build));
  }
  throw new Error(`the evaluator does not know this leaf: ${JSON.stringify(node)}`);
}

/** Every account the tree admits on a build that is NOT the locked one. */
function readersOnAnotherBuild(tree, accounts = [OWNER, AGENT, 'stranger.near']) {
  return accounts.filter((a) => admits(tree, a, H2));
}

test('L1 a grant does not unlock the row for the grantee', () => {
  const locked = and(wl(OWNER), lock());
  assert.deepEqual(readersOnAnotherBuild(locked), [], 'precondition: nobody reads on another build');

  const granted = withGrant(locked, OWNER, AGENT, null);

  assert.deepEqual(
    readersOnAnotherBuild(granted),
    [],
    'a grant must widen WHO reads, never WHICH build may read'
  );
  assert.ok(admits(granted, AGENT, H), 'the agent does read on the locked build');
  assert.ok(admits(granted, OWNER, H), 'and the owner still does');
});

test('L1 the grant is visible as a grant afterwards', () => {
  const granted = withGrant(and(wl(OWNER), lock()), OWNER, AGENT, null);
  assert.deepEqual(
    grantsOf(granted, OWNER).map((g) => g.account),
    [AGENT],
    'the screen must still list who the secret was handed to'
  );
});

test('L2 a dated grant is locked too', () => {
  const until = String(BigInt(Date.now() + 86_400_000) * 1_000_000n);
  const granted = withGrant(and(wl(OWNER), lock()), OWNER, AGENT, until);
  assert.deepEqual(readersOnAnotherBuild(granted), []);
  assert.ok(admits(granted, AGENT, H));
});

test('L3 revoking a grant keeps the lock', () => {
  const granted = withGrant(and(wl(OWNER), lock()), OWNER, AGENT, null);
  const revoked = withoutGrant(granted, AGENT, OWNER);
  assert.deepEqual(readersOnAnotherBuild(revoked), []);
  assert.ok(!admits(revoked, AGENT, H), 'the agent is gone');
  assert.ok(admits(revoked, OWNER, H), 'the owner is not');
});

test('L3 revoking the ONLY named account keeps the lock', () => {
  // The owner is not in this whitelist, so pruning the agent empties the AND.
  // The fallback must not be a bare whitelist: that reads on every build.
  const revoked = withoutGrant(and(wl(AGENT), lock()), AGENT, OWNER);
  assert.deepEqual(readersOnAnotherBuild(revoked), []);
});

test('L4 a grant onto an unlocked row is unchanged by the lock handling', () => {
  const granted = withGrant(wl(OWNER), OWNER, AGENT, null);
  assert.deepEqual(granted, wl(OWNER, AGENT), 'no lock, no wrapper');
});

test('L5 a grant onto an AllowAll row stays AllowAll-shaped', () => {
  const granted = withGrant('AllowAll', OWNER, AGENT, null);
  assert.ok(admits(granted, AGENT, H2) && admits(granted, OWNER, H2));
});

test('L6 a rule that allows EITHER of two builds still allows either', () => {
  // The shape that made the old leaf-by-leaf lifting produce an unsatisfiable
  // row: put two alternatives back as separate ANDs and neither is admitted.
  const either = and(wl(OWNER), or(lock(H), lock(H2)));
  assert.ok(admits(either, OWNER, H) && admits(either, OWNER, H2), 'precondition');

  const granted = withGrant(either, OWNER, AGENT, null);
  for (const who of [OWNER, AGENT]) {
    assert.ok(admits(granted, who, H), `${who} lost build H`);
    assert.ok(admits(granted, who, H2), `${who} lost build H2`);
  }
  assert.ok(!admits(granted, 'stranger.near', H), 'and it is still a grant, not an opening');
});

test('L6 a rule that BANS one build still bans it, and only it', () => {
  // `Not{lock}` means "any build but this one". Lifting the leaf out of the Not
  // and putting it back plain inverts the rule into "only this one" — the one
  // build the owner excluded.
  const except = and(wl(OWNER), { Not: { condition: lock(H) } });
  assert.ok(!admits(except, OWNER, H) && admits(except, OWNER, H2), 'precondition');

  const granted = withGrant(except, OWNER, AGENT, null);
  for (const who of [OWNER, AGENT]) {
    assert.ok(!admits(granted, who, H), `${who} was admitted on the banned build`);
    assert.ok(admits(granted, who, H2), `${who} lost every other build`);
  }
});

test('L6 revoking restores the tree a grant was made on', () => {
  for (const before of [
    and(wl(OWNER), lock(H)),
    and(wl(OWNER), or(lock(H), lock(H2))),
    and(wl(OWNER), { Not: { condition: lock(H) } }),
  ]) {
    const after = withoutGrant(withGrant(before, OWNER, AGENT, null), AGENT, OWNER);
    for (const build of [H, H2]) {
      assert.equal(
        admits(after, OWNER, build),
        admits(before, OWNER, build),
        `the owner's access on ${build.slice(0, 4)} changed across a grant and its revocation`
      );
      assert.ok(!admits(after, AGENT, build), 'and the agent reads nothing');
    }
  }
});

test('L7 an edit never leaves an emptied Logic node behind', () => {
  // An `And` of nothing admits everyone. Lifting the only leaf out of a node
  // must collapse the node, not leave `{Logic:{And,[]}}` in the tree.
  const granted = withGrant(and(lock()), OWNER, AGENT, null);
  const seen = JSON.stringify(granted);
  assert.ok(!/"conditions":\[\]/.test(seen), `emptied node left behind: ${seen}`);
  assert.deepEqual(readersOnAnotherBuild(granted), []);
});

test('L8 the condition survives a round trip through both converters', () => {
  const locked = and(wl(OWNER), lock());
  const ui = convertAccessFromContractFormat(locked);
  assert.deepEqual(convertAccessToContractFormat(ui), locked);
});

test('L9 a lock is shown, not hidden', () => {
  const shown = formatAccessCondition(and(wl(OWNER), lock()));
  assert.ok(shown.includes('Build'), `the card must say the row is locked: ${shown}`);
  assert.ok(shown.includes(H.slice(0, 8)), 'and name the build');
});

test('L10 a build that the keystore could never match is refused before signing', () => {
  assert.equal(buildHashRefusal(and(wl(OWNER), lock())), null, 'a real SHA-256 passes');
  for (const bad of ['', H.slice(0, 63), `${H}0`, H.toUpperCase(), 'zz']) {
    const why = buildHashRefusal(and(wl(OWNER), { WasmHash: { hash: bad } }));
    assert.ok(why, `"${bad.slice(0, 12)}" (${bad.length} chars) must be refused`);
    assert.ok(/64 lowercase hex/.test(why), why);
  }
});

test('L10 a malformed build is found wherever it sits', () => {
  const nested = or(wl(OWNER), { Not: { condition: { WasmHash: { hash: 'nope' } } } });
  assert.ok(buildHashRefusal(nested), 'a leaf under Not inside an Or is still a leaf');
});

test('L11 the evaluator this file judges by agrees with the keystore on empty nodes', () => {
  // Pinned because every assertion above rests on it: if an `And` of nothing
  // were FALSE here, L7 would pass while the real row was open to everyone.
  assert.equal(admits({ Logic: { operator: 'And', conditions: [] } }, OWNER, H2), true);
  assert.equal(admits({ Logic: { operator: 'Or', conditions: [] } }, OWNER, H2), false);
});
