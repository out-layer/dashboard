import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_POLICY,
  buildPolicyRules,
  decimalFromUnits,
  parsePolicyResponse,
  tokenLimitsProblems,
  unitsFromDecimal,
} from '../lib/wallet-policy.ts';

const USDC = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

test('a token row is written under its own key, beside native, in every window it fills', () => {
  const policy = buildPolicyRules({
    ...DEFAULT_POLICY,
    daily_limit: '10',
    token_limits: [{ token: USDC, per_transaction: '5000000', hourly: '', daily: '50000000', monthly: '' }],
  });
  assert.deepEqual(policy.rules.limits, {
    per_transaction: { [USDC]: '5000000' },
    daily: { native: '10000000000000000000000000', [USDC]: '50000000' },
  });
});

test('limits the form did not write survive a load and a save unchanged', () => {
  const stored = {
    rules: {
      limits: {
        per_transaction: { native: '1000000000000000000000000', [USDC]: '5000000' },
        daily: { '*': '777', [USDC]: '50000000' },
        monthly: { 'nep245:v2_1.omni.hot.tg:56_11111111111111111111': '9' },
      },
    },
  };
  const { form } = parsePolicyResponse(stored);
  assert.equal(form.daily_limit, '', 'a `*` limit is not shown as a NEAR limit');
  assert.deepEqual(buildPolicyRules(form).rules.limits, stored.rules.limits);
});

test('a row the keystore could not read is named before it is stored', () => {
  assert.deepEqual(tokenLimitsProblems([{ token: USDC, per_transaction: '5', hourly: '', daily: '', monthly: '' }]), []);
  assert.equal(tokenLimitsProblems([{ token: USDC, per_transaction: '1.5', hourly: '', daily: '', monthly: '' }]).length, 1);
  assert.equal(tokenLimitsProblems([{ token: '', per_transaction: '5', hourly: '', daily: '', monthly: '' }]).length, 1);
  assert.equal(tokenLimitsProblems([{ token: 'native', per_transaction: '', hourly: '', daily: '', monthly: '' }]).length, 1);
  const twice = { token: USDC, per_transaction: '', hourly: '', daily: '1', monthly: '' };
  assert.equal(tokenLimitsProblems([twice, twice]).length, 1);
});

test('decimal amounts convert to minimal units and back, and refuse what the token cannot hold', () => {
  assert.equal(unitsFromDecimal('12.5', 6), '12500000');
  assert.equal(unitsFromDecimal('0.000001', 6), '1');
  assert.equal(unitsFromDecimal('.5', 6), '500000');
  assert.equal(unitsFromDecimal('7', 0), '7');
  assert.equal(unitsFromDecimal('', 6), '');
  assert.equal(unitsFromDecimal('0', 6), '0');
  assert.equal(unitsFromDecimal('0.0000001', 6), null);
  assert.equal(unitsFromDecimal('1e3', 6), null);
  assert.equal(unitsFromDecimal('-1', 6), null);
  assert.equal(unitsFromDecimal('.', 6), null);
  assert.equal(decimalFromUnits('12500000', 6), '12.5');
  assert.equal(decimalFromUnits('1', 6), '0.000001');
  assert.equal(decimalFromUnits('777', 0), '777');
  assert.equal(decimalFromUnits('', 6), '');
});

// ---------------------------------------------------------------------------
// The protected start, capability-owned types, the address list, the summary
// ---------------------------------------------------------------------------

import { protectedAgentPolicy, withAddresses, summarizePolicy, addressProblem, effectiveTransactionTypes } from '../lib/wallet-policy.ts';

const WALLET = '71b24ed09bd36553f0bb2738ff59683113dd7bd82ed608b451bb1bd29dbdfae0';

test('the protected start pays only the owner and the wallet, with no contract call and every other capability off', () => {
  const form = protectedAgentPolicy({ ownerAccount: 'alice.near', walletAccount: WALLET, tokens: [USDC] });
  const policy = buildPolicyRules(form, 'aa'.repeat(32));
  assert.deepEqual(policy.rules.addresses, { mode: 'whitelist', list: ['alice.near', WALLET] });
  assert.deepEqual(policy.rules.transaction_types, ['transfer', 'intents_withdraw', 'intents_transfer', 'cross_chain_withdraw']);
  assert.deepEqual(policy.rules.allowed_tokens, ['native', USDC]);
  assert.deepEqual(policy.capabilities, {
    cross_chain_withdraw: { allowed: true },
    evm_sign: { allowed: false },
    solana_sign: { allowed: false },
  });
  assert.deepEqual(policy.authorized_key_hashes, ['aa'.repeat(32)]);
  // And it reads back as itself.
  assert.deepEqual(parsePolicyResponse(policy, 'aa'.repeat(32)).form, form);
});

test('a capability switch writes its type with it, and reads as on only when both halves are stored', () => {
  const base = { ...DEFAULT_POLICY, transaction_types: 'transfer' };
  assert.deepEqual(effectiveTransactionTypes({ ...base, swap_enabled: true, payment_check_enabled: true, confidential_enabled: true }),
    ['transfer', 'intents_swap', 'payment_check', 'confidential']);
  // A type left in the box without its capability is not saved.
  assert.deepEqual(effectiveTransactionTypes({ ...base, transaction_types: 'transfer,intents_swap,cross_chain_withdraw' }), ['transfer']);
  // No rule stays no rule.
  assert.equal(effectiveTransactionTypes({ ...DEFAULT_POLICY, transaction_types: '', swap_enabled: true }), null);

  const capOnly = parsePolicyResponse({ rules: { transaction_types: ['transfer'] }, capabilities: { swap: { allowed: true } } });
  assert.equal(capOnly.form.swap_enabled, false, 'the type rule refuses the swap, so the switch is off');
  const both = parsePolicyResponse({ rules: { transaction_types: ['transfer', 'swap'] }, capabilities: { swap: { allowed: true } } });
  assert.equal(both.form.swap_enabled, true);
  const noRule = parsePolicyResponse({ capabilities: { swap: { allowed: true } } });
  assert.equal(noRule.form.swap_enabled, true);
});

test('a token list that covers native and the limited tokens is the switch; any other is kept as written', () => {
  const custom = parsePolicyResponse({ rules: { allowed_tokens: ['nep141:wrap.near'] } });
  assert.equal(custom.form.only_limited_tokens, false, 'native is left out: a hand-written list');
  assert.equal(custom.form.allowed_tokens, 'nep141:wrap.near');
  assert.deepEqual(buildPolicyRules(custom.form).rules.allowed_tokens, ['nep141:wrap.near']);

  const derived = parsePolicyResponse({ rules: { allowed_tokens: ['native', USDC, 'nep141:wrap.near'], limits: { daily: { [USDC]: '1' } } } });
  assert.equal(derived.form.only_limited_tokens, true);
  assert.deepEqual(derived.form.token_limits.map((r) => r.token), [USDC, 'nep141:wrap.near'], 'a permitted token without amounts is a row');
  assert.deepEqual(buildPolicyRules(derived.form).rules.allowed_tokens, ['native', USDC, 'nep141:wrap.near']);
});

test('an address is added once, only to a list that admits addresses', () => {
  const form = protectedAgentPolicy({ ownerAccount: 'alice.near', walletAccount: WALLET });
  const added = withAddresses(form, ['0xAbC0000000000000000000000000000000000001', 'ALICE.near', '0xabc0000000000000000000000000000000000001']);
  assert.deepEqual(added.added, ['0xAbC0000000000000000000000000000000000001']);
  assert.equal(added.form.addresses, `alice.near, ${WALLET}, 0xAbC0000000000000000000000000000000000001`);
  assert.deepEqual(withAddresses({ ...DEFAULT_POLICY }, ['bob.near']), { form: { ...DEFAULT_POLICY }, added: [], mode: 'none' });
  assert.equal(addressProblem('bob.near'), null);
  assert.notEqual(addressProblem('bob.near, eve.near'), null);
  assert.notEqual(addressProblem('two words'), null);
});

test('the summary says what the protected start permits and what is missing from it', () => {
  const form = protectedAgentPolicy({ ownerAccount: 'alice.near', walletAccount: WALLET, tokens: [USDC] });
  const label = (key) => (key === USDC ? { symbol: 'USDC', decimals: 6 } : null);
  const bare = summarizePolicy(form, { approval: false, tokenLabel: label });
  assert.deepEqual(bare.can, ['Send money only to the 2 listed addresses, on NEAR or another chain.']);
  assert.deepEqual(bare.cautions, ['NEAR has no limit.', 'USDC has no limit.']);
  assert.ok(bare.cannot.includes('Call contracts.') && bare.cannot.includes('Swap tokens.') && bare.cannot.includes('Move a token that has no limit row.'));

  const limited = summarizePolicy(
    { ...form, daily_limit: '5', token_limits: [{ token: USDC, per_transaction: '20000000', hourly: '', daily: '100000000', monthly: '' }] },
    { approval: false, tokenLabel: label },
  );
  assert.deepEqual(limited.cautions, []);
  assert.ok(limited.can.includes('NEAR: up to 5 per day.'));
  assert.ok(limited.can.includes('USDC: up to 20 per transaction, 100 per day.'));

  const open = summarizePolicy(DEFAULT_POLICY, { approval: false });
  assert.ok(open.cautions.includes('No address list: a leaked key can pay anyone, within the limits.'));
});

// ---------------------------------------------------------------------------
// Policies stored before this form: opened and saved untouched, they permit
// what they permitted
// ---------------------------------------------------------------------------

const KEY_HASH = 'bb'.repeat(32);
const OLD_TYPES = ['transfer', 'call', 'delete', 'intents_withdraw', 'intents_swap'];
const resave = (stored) => {
  const parsed = parsePolicyResponse(stored, KEY_HASH);
  return { saved: buildPolicyRules(parsed.form, KEY_HASH), inert: parsed.inertCapabilities };
};
const sorted = (list) => [...list].sort();

test('a limits-only policy of the earlier form is saved as it was, minus a swap type no capability backed', () => {
  const stored = {
    rules: {
      limits: { per_transaction: { native: '1000000000000000000000000' }, daily: { native: '5000000000000000000000000' } },
      transaction_types: OLD_TYPES,
      time_restrictions: { timezone: 'UTC', allowed_hours: [9, 17], allowed_days: [1, 2, 3] },
      rate_limit: { max_per_hour: 10 },
    },
    capabilities: { evm_sign: { allowed: false }, solana_sign: { allowed: false } },
    webhook_url: 'https://example.com/hook',
    authorized_key_hashes: [KEY_HASH, 'cc'.repeat(32)],
    refund_addresses: { base: '0x1111111111111111111111111111111111111111' },
  };
  const { saved, inert } = resave(stored);
  assert.deepEqual(inert, []);
  // `intents_swap` without the `swap` capability was refused by the engine; it is no longer written.
  assert.deepEqual(saved, { ...stored, rules: { ...stored.rules, transaction_types: ['transfer', 'call', 'delete', 'intents_withdraw'] } });
});

test('capabilities that worked keep working, with their types', () => {
  const stored = {
    rules: {
      addresses: { mode: 'whitelist', list: ['alice.near', 'bob.near'] },
      transaction_types: [...OLD_TYPES, 'cross_chain_withdraw', 'limit_order'],
      allowed_tokens: ['native', 'nep141:wrap.near'],
    },
    capabilities: {
      swap: { allowed: true },
      cross_chain_withdraw: { allowed: true },
      limit_order: { allowed: true },
      sign_message: { allowed: true, allowed_recipients: ['app.near'] },
      evm_sign: { allowed: true, raw_tx: true },
      solana_sign: { allowed: false },
    },
    authorized_key_hashes: [KEY_HASH],
  };
  const { saved, inert } = resave(stored);
  assert.deepEqual(inert, []);
  assert.deepEqual(sorted(saved.rules.transaction_types), sorted(stored.rules.transaction_types));
  assert.deepEqual({ ...saved.rules, transaction_types: null }, { ...stored.rules, transaction_types: null });
  assert.deepEqual(saved.capabilities, stored.capabilities);
});

test('a capability the stored type rule refused is reported and stays refused', () => {
  const stored = {
    rules: { transaction_types: OLD_TYPES },
    capabilities: {
      confidential: { allowed: true },
      payment_check: { allowed: true },
      raw_sign: { allowed: true, requires_approval: false, chains: ['solana'] },
      evm_sign: { allowed: false },
      solana_sign: { allowed: false },
    },
  };
  const { saved, inert } = resave(stored);
  assert.deepEqual(sorted(inert), ['confidential', 'payment_check', 'raw_sign']);
  assert.deepEqual(saved.rules.transaction_types, ['transfer', 'call', 'delete', 'intents_withdraw']);
  assert.deepEqual(saved.capabilities, { evm_sign: { allowed: false }, solana_sign: { allowed: false } });
});

test('with no type rule, every stored capability reads as on and no rule appears', () => {
  const stored = {
    capabilities: {
      confidential: { allowed: true },
      payment_check: { allowed: true },
      swap: { allowed: true },
      evm_sign: { allowed: false },
      solana_sign: { allowed: true },
    },
  };
  const { saved, inert } = resave(stored);
  assert.deepEqual(inert, []);
  assert.equal(saved.rules, undefined);
  assert.deepEqual(saved.capabilities, stored.capabilities);
});

test('token lists and thresholds keep their meaning', () => {
  assert.deepEqual(resave({ rules: { allowed_tokens: [] } }).saved.rules.allowed_tokens, [], 'an empty list still permits no token');
  assert.equal(resave({ rules: {} }).saved.rules, undefined);
  assert.equal(parsePolicyResponse({ approval: { threshold: 3, approvers: [{ id: 'a.near' }] } }).approval.required, '3');
  assert.equal(parsePolicyResponse({ approval: { threshold: { required: 2 }, approvers: [] } }).approval.required, '2');
  assert.equal(parsePolicyResponse({ approval: { threshold: {}, approvers: [] } }).approval.required, '2');
});

test('what the form has no field for is kept from the stored policy, and nothing switched off comes back', () => {
  const stored = {
    rules: {
      limits: { daily: { native: '1' }, hourly_tx_count: 7 },
      time_restrictions: { timezone: 'Europe/Berlin', allowed_days: [1] },
      future_rule: { x: 1 },
      transaction_types: ['transfer', 'swap', 'payment_check'],
    },
    capabilities: {
      swap: { allowed: true, requires_approval: true },
      payment_check: { allowed: true, requires_approval: true },
      future_capability: { allowed: true },
      evm_sign: { allowed: false, raw_tx: true },
      solana_sign: { allowed: false },
    },
  };
  const { form } = parsePolicyResponse(stored);
  const saved = buildPolicyRules(form, undefined, stored);
  assert.equal(saved.rules.limits.hourly_tx_count, 7);
  // The form shows hours and days in UTC and writes UTC: the engine reads no other zone.
  assert.deepEqual(saved.rules.time_restrictions, { timezone: 'UTC', allowed_days: [1] });
  assert.deepEqual(saved.rules.future_rule, { x: 1 });
  assert.deepEqual(saved.capabilities.swap, { allowed: true, requires_approval: true });
  assert.deepEqual(saved.capabilities.future_capability, { allowed: true });
  assert.deepEqual(saved.capabilities.evm_sign, { allowed: false }, 'a refused capability takes nothing from the stored one');

  // Switched off in the form: gone with everything in it.
  const off = buildPolicyRules({ ...form, payment_check_enabled: false, daily_limit: '', allowed_days: '' }, undefined, stored);
  assert.equal(off.capabilities.payment_check, undefined);
  assert.deepEqual(off.rules.limits, { hourly_tx_count: 7 }, 'the member the form cannot show stays');
  assert.equal(off.rules.time_restrictions, undefined);

  // A form that was not loaded from a policy carries nothing.
  assert.deepEqual(buildPolicyRules(form), buildPolicyRules(form, undefined, undefined));
});
