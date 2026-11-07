// The intents_call switch, through the form and back.
//
// SECURITY: a `call` to intents.near acts as the wallet's intents account — it
// can add a key that signs for it outside the TEE for good. The keystore denies
// it unless the policy says `intents_call.allowed: true`, so the invariant here
// is that no policy this form writes says so unless the owner ticked the box,
// and that a ticked box reads back as itself.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPolicyRules, parsePolicyResponse, DEFAULT_POLICY } from '../lib/wallet-policy.ts';

const build = (form) => buildPolicyRules({ ...DEFAULT_POLICY, ...form });

test('off in every new policy, and not written at all', () => {
  assert.equal(DEFAULT_POLICY.intents_call_enabled, false);
  const policy = build({});
  assert.equal(policy.capabilities?.intents_call, undefined);
  // Opening every other capability does not open this one.
  const everything = build({
    raw_sign_enabled: true, confidential_enabled: true, payment_check_enabled: true, swap_enabled: true,
    cross_chain_withdraw_enabled: true, limit_order_enabled: true, evm_sign_enabled: true, solana_sign_enabled: true,
  });
  assert.equal(everything.capabilities?.intents_call, undefined);
});

test('ticked, it is written as allowed and survives open-and-save', () => {
  const policy = build({ intents_call_enabled: true });
  assert.deepEqual(policy.capabilities.intents_call, { allowed: true });
  const { form } = parsePolicyResponse({ rules: policy.rules, capabilities: policy.capabilities });
  assert.equal(form.intents_call_enabled, true);
  assert.deepEqual(buildPolicyRules(form).capabilities.intents_call, { allowed: true });
});

test('a stored policy without it, or with allowed:false, loads unticked', () => {
  for (const capabilities of [{}, { intents_call: { allowed: false } }, { intents_call: {} }]) {
    const { form } = parsePolicyResponse({ rules: {}, capabilities });
    assert.equal(form.intents_call_enabled, false, JSON.stringify(capabilities));
    assert.equal(buildPolicyRules(form).capabilities?.intents_call, undefined);
  }
});
