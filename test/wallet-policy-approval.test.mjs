import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_POLICY,
  NO_AUTO_APPROVAL,
  approvalWithStored,
  autoUpToProblems,
  buildAutoUpTo,
  buildPolicyRules,
  parseApproverLine,
  parseAutoUpTo,
  parsePolicyResponse,
  summarizePolicy,
} from '../lib/wallet-policy.ts';

const USDC = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

test('the threshold is written under its one window, for the tokens that have an amount', () => {
  assert.equal(buildAutoUpTo(NO_AUTO_APPROVAL), null);
  assert.equal(buildAutoUpTo({ window: 'daily', amounts: { native: '', [USDC]: '  ' } }), null);
  assert.deepEqual(buildAutoUpTo({ window: 'monthly', amounts: { native: '5', [USDC]: '50000000', other: '' } }), {
    monthly: { native: '5', [USDC]: '50000000' },
  });
});

test('a stored threshold of one window loads into the form and saves back the same', () => {
  const stored = { daily: { native: '5000000000000000000000000', [USDC]: '50000000' } };
  const { auto, several } = parseAutoUpTo(stored);
  assert.equal(several, null);
  assert.equal(auto.window, 'daily');
  assert.deepEqual(buildAutoUpTo(auto), stored);
  assert.deepEqual(parseAutoUpTo(undefined), { auto: NO_AUTO_APPROVAL, several: null });
  assert.deepEqual(parseAutoUpTo({ daily: {} }), { auto: NO_AUTO_APPROVAL, several: null });
});

test('a threshold the form cannot edit is kept as stored', () => {
  const two = { hourly: { native: '1' }, daily: { native: '5' } };
  assert.deepEqual(parseAutoUpTo(two).several, two);
  const unknown = { daily: { native: '5' }, weekly: { native: '9' } };
  assert.deepEqual(parseAutoUpTo(unknown).several, unknown);
});

test('a cleared threshold does not come back from the stored policy', () => {
  const stored = { threshold: { required: 1 }, approvers: [], auto_up_to: { daily: { native: '5' } }, note: 'kept' };
  const built = approvalWithStored({ threshold: { required: 1 }, approvers: [] }, stored);
  assert.equal('auto_up_to' in built, false);
  assert.equal(built.note, 'kept');
});

test('an amount that is not whole minimal units, or a wildcard, is a problem', () => {
  assert.deepEqual(autoUpToProblems({ window: 'daily', amounts: { native: '5', [USDC]: '' } }), []);
  assert.equal(autoUpToProblems({ window: 'daily', amounts: { native: '0.5' } }).length, 1);
  assert.equal(autoUpToProblems({ window: 'daily', amounts: { '*': '5' } }).length, 1);
});

test('asking about a new address is written only under a whitelist, and its absence is off', () => {
  const list = { ...DEFAULT_POLICY, address_mode: 'whitelist', addresses: 'a.near' };
  assert.deepEqual(buildPolicyRules({ ...list, ask_unlisted: true }).rules.addresses, {
    mode: 'whitelist',
    list: ['a.near'],
    unlisted: 'ask',
  });
  assert.equal('unlisted' in buildPolicyRules(list).rules.addresses, false);
  assert.equal('unlisted' in buildPolicyRules({ ...list, address_mode: 'blacklist', ask_unlisted: true }).rules.addresses, false);

  // Switched off in the form, it does not come back from the stored policy;
  // another stored member of the section does.
  const stored = { rules: { addresses: { mode: 'whitelist', list: ['a.near'], unlisted: 'ask', note: 'kept' } } };
  const saved = buildPolicyRules(list, undefined, stored).rules.addresses;
  assert.equal('unlisted' in saved, false);
  assert.equal(saved.note, 'kept');
});

test('a stored policy reads its new-address rule back, and one without it is saved without it', () => {
  const asking = { rules: { addresses: { mode: 'whitelist', list: ['a.near'], unlisted: 'ask' } } };
  assert.equal(parsePolicyResponse(asking).form.ask_unlisted, true);
  assert.equal(parsePolicyResponse({ rules: { addresses: { list: ['a.near'], unlisted: 'ask' } } }).form.ask_unlisted, true);
  assert.equal(parsePolicyResponse({ rules: { addresses: { mode: 'blacklist', list: [], unlisted: 'ask' } } }).form.ask_unlisted, false);

  const plain = { rules: { addresses: { mode: 'whitelist', list: ['a.near'] } } };
  const form = parsePolicyResponse(plain).form;
  assert.equal(form.ask_unlisted, false);
  assert.deepEqual(buildPolicyRules(form, undefined, plain).rules.addresses, plain.rules.addresses);
});

test('the summary says what runs without asking and that a new address asks', () => {
  const form = { ...DEFAULT_POLICY, address_mode: 'whitelist', addresses: 'a.near', ask_unlisted: true };
  const auto = { window: 'daily', amounts: { native: '5000000000000000000000000', [USDC]: '50000000' } };
  const tokenLabel = (key) => (key === USDC ? { symbol: 'USDC', decimals: 6 } : null);
  const on = summarizePolicy(form, { approval: true, tokenLabel, auto });
  assert.ok(on.can.some((line) => line.includes('5 NEAR, 50 USDC a day')), on.can.join('\n'));
  assert.ok(on.can.some((line) => line.includes('not on the list')));
  assert.ok(on.cannot.some((line) => line.includes('refused, not asked')));
  assert.ok(on.cautions.some((line) => line.includes('new address')));

  const empty = summarizePolicy(form, { approval: true, tokenLabel, auto: NO_AUTO_APPROVAL });
  assert.ok(empty.can.includes('Operations you chose wait for your approval before they run.'));

  const off = summarizePolicy(form, { approval: false, tokenLabel, auto });
  assert.equal(off.can.some((line) => line.includes('without asking')), false);
  assert.equal(off.can.some((line) => line.includes('not on the list.') && line.startsWith('Ask')), false);
});

test('an approver line is an account, an optional label and an optional key, the key wherever it stands', () => {
  assert.deepEqual(parseApproverLine('bob.near'), { id: 'bob.near', role: 'signer' });
  assert.deepEqual(parseApproverLine('bob.near, admin'), { id: 'bob.near', role: 'admin' });
  assert.deepEqual(parseApproverLine('bob.near, signer, ed25519:abc'), { id: 'bob.near', role: 'signer', pubkey: 'ed25519:abc' });
  // A key right after the account is the key, not a label: read as a label it
  // would be dropped, and the approver would vote with any key of the account.
  assert.deepEqual(parseApproverLine('bob.near, ed25519:abc'), { id: 'bob.near', role: 'signer', pubkey: 'ed25519:abc' });
  assert.equal(parseApproverLine('  '), null);
});
