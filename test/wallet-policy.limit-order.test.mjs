// The limit_order switch, through the form and back.
//
// A limit order is gated TWICE by the keystore: a default-DENY capability and
// a transaction type of its own. The form shows ONE switch, because two
// controls for one permission can be set against each other — and the losing
// combination (capability on, type missing) reads as "enabled" on the page
// while the keystore refuses every order. So the invariant here is that the
// switch always writes both halves, always removes both, and reads back as
// itself.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyRules, parsePolicyResponse, effectiveTransactionTypes, DEFAULT_POLICY } from '../lib/wallet-policy.ts';

const build = (form) => buildPolicyRules({ ...DEFAULT_POLICY, ...form });

test('off by default, like every capability that can move funds out', () => {
  const policy = build({});
  assert.equal(DEFAULT_POLICY.limit_order_enabled, false);
  assert.equal(policy.capabilities?.limit_order, undefined);
  assert.ok(!policy.rules.transaction_types.includes('limit_order'));
});

test('switching it on writes BOTH halves of the gate', () => {
  const policy = build({ limit_order_enabled: true });
  assert.deepEqual(policy.capabilities.limit_order, { allowed: true });
  assert.ok(policy.rules.transaction_types.includes('limit_order'));
});

test('switching it off removes both, even if the type was typed in by hand', () => {
  const policy = build({
    limit_order_enabled: false,
    transaction_types: 'transfer,limit_order,call',
  });
  assert.equal(policy.capabilities?.limit_order, undefined);
  assert.deepEqual(policy.rules.transaction_types, ['transfer', 'call']);
});

test('the type is never written twice', () => {
  const policy = build({ limit_order_enabled: true, transaction_types: 'transfer,limit_order' });
  assert.equal(policy.rules.transaction_types.filter((t) => t === 'limit_order').length, 1);
});

test('an enabled policy survives open-and-save unchanged', () => {
  const policy = build({ limit_order_enabled: true });
  const { form } = parsePolicyResponse({ rules: policy.rules, capabilities: policy.capabilities });
  assert.equal(form.limit_order_enabled, true);
  assert.deepEqual(buildPolicyRules(form).rules.transaction_types, policy.rules.transaction_types);
  assert.deepEqual(buildPolicyRules(form).capabilities.limit_order, { allowed: true });
});

test('a wallet restricted to limit orders ONLY is not opened up by a Save', () => {
  // The regression: with `limit_order` cut out of the loaded types, this policy
  // loaded as an empty box — "no restriction" — and saving it, untouched,
  // dropped the rule and permitted transfer, call, delete and the rest.
  const stored = { rules: { transaction_types: ['limit_order'] }, capabilities: { limit_order: { allowed: true } } };
  const { form } = parsePolicyResponse(stored);
  assert.deepEqual(buildPolicyRules(form).rules.transaction_types, ['limit_order']);

  // Switching limit orders OFF on that wallet leaves it able to do nothing —
  // never everything.
  const off = buildPolicyRules({ ...form, limit_order_enabled: false });
  assert.deepEqual(off.rules.transaction_types, []);
  assert.equal(off.capabilities?.limit_order, undefined);

  // …and that survives being stored, loaded and saved again. An empty list
  // loaded as an empty box would mean "no restriction", and the next Save —
  // of anything — would drop the rule and permit every type.
  const reloaded = parsePolicyResponse({ rules: off.rules, capabilities: off.capabilities }).form;
  assert.notEqual(reloaded.transaction_types.trim(), '');
  assert.deepEqual(buildPolicyRules(reloaded).rules.transaction_types, []);
  // The form's "permits NO transaction type" warning reads the list that is
  // SAVED, not the box: here the box still says `limit_order`, and what is
  // saved is nothing.
  assert.deepEqual(effectiveTransactionTypes({ ...form, limit_order_enabled: false }), []);
  assert.deepEqual(effectiveTransactionTypes(form), ['limit_order']);
  assert.equal(effectiveTransactionTypes({ transaction_types: '', limit_order_enabled: true }), null);

  // A policy with no type rule at all still loads as an empty box.
  assert.equal(parsePolicyResponse({ rules: {} }).form.transaction_types, '');
});

test('the type stays out of sight when other checkboxes are toggled, and is kept', () => {
  // PolicyFormFields rebuilds the string from the parsed list on every toggle;
  // `limit_order` has no checkbox, so it must ride along untouched.
  const { form } = parsePolicyResponse({
    rules: { transaction_types: ['transfer', 'limit_order'] },
    capabilities: { limit_order: { allowed: true } },
  });
  const toggled = { ...form, transaction_types: form.transaction_types.split(',').filter((t) => t !== 'transfer').join(',') };
  assert.deepEqual(buildPolicyRules(toggled).rules.transaction_types, ['limit_order']);
});

test('enabling swap or cross-chain withdraw does not enable limit orders', () => {
  const policy = build({ swap_enabled: true, cross_chain_withdraw_enabled: true });
  assert.equal(policy.capabilities.limit_order, undefined);
  assert.ok(!policy.rules.transaction_types.includes('limit_order'));
});
