// refund_addresses, through the form and back, and the address rules the
// coordinator enforces at encrypt-policy.
//
// The invariants: a policy that lists no refund address produces the same
// request body it always did (no `refund_addresses` key at all); a listed one
// round-trips; and the client refuses exactly what the coordinator refuses —
// its cases are copied from `refund_address_shapes_per_chain` in
// outlayer-coordinator `src/wallet/cross_chain.rs`.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPolicyRules,
  parsePolicyResponse,
  canonicalRefundChain,
  refundAddressProblem,
  refundAddressesProblems,
  DEFAULT_POLICY,
} from '../lib/wallet-policy.ts';

const EVM = '0x582290c0b2Cb60989B35FFF66049f3e3247355bc';
const SOL = '5AmGa2Bcfajbytg55UUb4vCAAzKBMYKZNQwx5S2BH2qf';

const build = (form) => buildPolicyRules({ ...DEFAULT_POLICY, ...form });

test('no rows: the policy carries no refund_addresses key', () => {
  assert.equal('refund_addresses' in build({}), false);
  assert.equal('refund_addresses' in build({ refund_addresses: [{ chain: '', address: '  ' }] }), false);
});

test('a stored policy without the field saves back byte-identical', () => {
  const stored = build({ daily_limit: '5', address_mode: 'whitelist', addresses: 'bob.near', swap_enabled: true });
  const parsed = parsePolicyResponse(stored);
  assert.deepEqual(parsed.form.refund_addresses, []);
  assert.equal(JSON.stringify(buildPolicyRules(parsed.form)), JSON.stringify(stored));
  assert.equal('refund_addresses' in parsed.fullJson, false);
});

test('listed addresses are written trimmed, keyed by chain, and read back', () => {
  const policy = build({
    refund_addresses: [
      { chain: 'hypercore', address: ` ${EVM} ` },
      { chain: 'solana', address: SOL },
    ],
  });
  assert.deepEqual(policy.refund_addresses, { hypercore: EVM, solana: SOL });
  const parsed = parsePolicyResponse({ rules: policy.rules, refund_addresses: policy.refund_addresses });
  assert.deepEqual(parsed.form.refund_addresses, [
    { chain: 'hypercore', address: EVM },
    { chain: 'solana', address: SOL },
  ]);
  assert.deepEqual(parsed.fullJson.refund_addresses, { hypercore: EVM, solana: SOL });
});

test('a half-filled row is written, so the submit check reports it', () => {
  const policy = build({ refund_addresses: [{ chain: 'base', address: '' }] });
  assert.deepEqual(policy.refund_addresses, { base: '' });
  assert.equal(refundAddressesProblems(policy.refund_addresses).length, 1);
});

test('chain aliases and letter case canonicalize as the coordinator does', () => {
  for (const [alias, id] of [
    ['eth', 'ethereum'], ['Ethereum', 'ethereum'], ['arb', 'arbitrum'], ['sol', 'solana'],
    ['btc', 'bitcoin'], ['pol', 'polygon'], ['op', 'optimism'], ['avax', 'avalanche'],
    ['zec', 'zcash'], ['doge', 'dogecoin'], ['ltc', 'litecoin'], ['bch', 'bitcoincash'],
    ['bera', 'berachain'], ['hypercore', 'hypercore'], ['hood', 'hood'], [' near ', 'near'],
  ]) {
    assert.equal(canonicalRefundChain(alias), id, alias);
  }
  assert.equal(canonicalRefundChain('hyperevm'), null);
  assert.equal(canonicalRefundChain(''), null);
});

test('address shapes per chain (the coordinator\'s own cases)', () => {
  assert.equal(refundAddressProblem('ethereum', EVM), null);
  assert.equal(refundAddressProblem('hypercore', EVM), null);
  assert.ok(refundAddressProblem('base', EVM.slice(0, 41)));
  assert.ok(refundAddressProblem('base', EVM.slice(2)));
  assert.ok(refundAddressProblem('base', '0xZZ82290c0b2Cb60989B35FFF66049f3e3247355bc'));
  assert.equal(refundAddressProblem('solana', SOL), null);
  assert.ok(refundAddressProblem('sol', 'notbase58!!'));
  assert.equal(refundAddressProblem('near', 'alice.near'), null);
  assert.ok(refundAddressProblem('near', 'Alice.near'));
  assert.equal(refundAddressProblem('bitcoin', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), null);
  assert.ok(refundAddressProblem('bitcoin', 'xyz'));
  // No derivation on the chain: shape only.
  assert.equal(refundAddressProblem('tron', 'TJRyWwFs9wTFGZg3JbrVriFyPJvbkg8PpN'), null);
  assert.ok(refundAddressProblem('tron', 'has space'));
  assert.ok(refundAddressProblem('tron', ''));
});

test('wrong family is refused both ways', () => {
  assert.ok(refundAddressProblem('hypercore', SOL));
  assert.ok(refundAddressProblem('polygon', SOL));
  assert.ok(refundAddressProblem('solana', EVM));
  assert.ok(refundAddressProblem('near', EVM));
});

test('near account ids follow the well-formedness rule', () => {
  for (const ok of ['ab', 'a-b.near', 'a_b', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef']) {
    assert.equal(refundAddressProblem('near', ok), null, ok);
  }
  for (const bad of ['a', '.near', 'near.', 'a..near', 'a-.near', 'x'.repeat(65)]) {
    assert.ok(refundAddressProblem('near', bad), bad);
  }
});

test('solana needs exactly 32 decoded bytes', () => {
  assert.ok(refundAddressProblem('solana', '11111111111111111111111111111111') === null);
  assert.ok(refundAddressProblem('solana', '1111111111111111111111111111111'));
});

test('the submit check: unknown chains, duplicate spellings, non-strings', () => {
  assert.deepEqual(refundAddressesProblems(undefined), []);
  assert.deepEqual(refundAddressesProblems({ base: EVM, sol: SOL }), []);
  assert.equal(refundAddressesProblems({ nowhere: EVM }).length, 1);
  assert.match(refundAddressesProblems({ eth: EVM, ethereum: EVM })[0], /twice/);
  assert.equal(refundAddressesProblems({ base: 7 }).length, 1);
  assert.equal(refundAddressesProblems([]).length, 1);
  assert.equal(refundAddressesProblems(null).length, 1);
});
