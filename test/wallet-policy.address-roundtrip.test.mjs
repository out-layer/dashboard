// The address rule, through the form and back.
//
// `buildPolicyRules` writes what the form holds and `parsePolicyResponse`
// reads what the wallet answers; the invariant is that the two round-trip:
// an owner who opens the policy page and saves something unrelated must get
// back exactly the rules they had. The shapes that matter: a whitelist stored
// without an explicit `mode` is still a whitelist, and a limits-only policy
// is "no restriction", not an empty whitelist (a deny-all nobody chose).
//
// Run: npm test  (node's own runner, no dependencies)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyRules, parsePolicyResponse, DEFAULT_POLICY } from '../lib/wallet-policy.ts';

/** The address half of a form, after a save-then-load.
 *
 * `buildPolicyRules` returns the whole POLICY (`{rules, capabilities, …}`)
 * despite its name, so what goes back into the reader is `.rules`. Getting
 * that wrong makes every assertion here pass against an empty policy, which is
 * how this helper is written the way it is. */
function roundTrip(form) {
  const policy = buildPolicyRules({ ...DEFAULT_POLICY, ...form });
  const parsed = parsePolicyResponse({ rules: policy.rules });
  return { mode: parsed.form.address_mode, addresses: parsed.form.addresses };
}

test('a whitelist survives a save-and-reload unchanged', () => {
  assert.deepEqual(
    roundTrip({ address_mode: 'whitelist', addresses: 'bob.near, alice.near' }),
    { mode: 'whitelist', addresses: 'bob.near, alice.near' },
  );
});

test('a blacklist survives too', () => {
  assert.deepEqual(
    roundTrip({ address_mode: 'blacklist', addresses: 'evil.near' }),
    { mode: 'blacklist', addresses: 'evil.near' },
  );
});

test('an EMPTY whitelist is kept, not silently turned off', () => {
  // The strictest address rule there is: no destination is permitted. The
  // write condition is the mode alone, never the list's length.
  assert.deepEqual(
    roundTrip({ address_mode: 'whitelist', addresses: '' }),
    { mode: 'whitelist', addresses: '' },
  );
});

test('"no restriction" does not become an address rule', () => {
  // The mirror defect: a policy with no address section at all — limits only,
  // the commonest shape and this form's own default — must not come back as an
  // empty whitelist, which would save as deny-all.
  const policy = buildPolicyRules({ ...DEFAULT_POLICY, daily_limit: '1' });
  assert.ok(policy.rules.limits, 'the fixture must actually produce a policy');
  assert.equal(policy.rules.addresses, undefined, 'nothing should write an address block here');
  assert.equal(parsePolicyResponse({ rules: policy.rules }).form.address_mode, 'none');
});

test('a section with no explicit mode reads as the engine reads it', () => {
  // shared-tee-helpers: `Addresses::mode` documents absent as whitelist, and
  // both evaluation paths do `unwrap_or("whitelist")`. Reading it any other way
  // here means the form disagrees with what is being enforced.
  const parsed = parsePolicyResponse({ rules: { addresses: { list: ['bob.near'] } } });
  assert.equal(parsed.form.address_mode, 'whitelist');
  assert.equal(parsed.form.addresses, 'bob.near');
});
