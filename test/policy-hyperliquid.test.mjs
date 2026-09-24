// The Hyperliquid policy as the editor writes and reads it: only set keys reach
// the JSON, an empty policy is READ-ONLY and says so, orders need all three
// sizes, and a stored policy comes back into the same value. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hyperliquidPolicy, coinProblem, withdrawToProblem } from '../lib/policies/hyperliquid.ts';
import { toJson, fromJson, validate, isUnrestricted, emptyValue } from '../lib/policies/policy.ts';

test('an empty policy is {} and is described as read-only', () => {
  assert.equal(toJson(hyperliquidPolicy, emptyValue()), '{}');
  assert.ok(isUnrestricted(emptyValue()));
  assert.match(hyperliquidPolicy.emptySummary, /read-only/);
  assert.equal(hyperliquidPolicy.summarize(emptyValue()), 'The agent cannot place orders or set leverage; it can neither fund the venue nor withdraw.');
});

test('only set fields reach the JSON, under the connector’s names, and round-trip', () => {
  const value = { max_order_usd: 100, max_daily_volume_usd: 1000, max_leverage: 5, coins: ['BTC', 'ETH'], allow_deposit: true, max_deposit_usd: 200 };
  const json = toJson(hyperliquidPolicy, value);
  assert.deepEqual(JSON.parse(json), value);
  const back = fromJson(hyperliquidPolicy, json);
  assert.deepEqual(back.value, value);
  assert.deepEqual(back.unknownKeys, []);
  assert.equal(
    hyperliquidPolicy.summarize(value),
    'The agent may trade BTC, ETH up to $100 per order and $1,000 a day at up to 5× leverage; it may fund the venue (up to $200 at a time) and cannot withdraw.',
  );
});

test('orders need all three sizes; one or two of them cannot be saved', () => {
  assert.equal(validate(hyperliquidPolicy, { max_order_usd: 100 }).length, 1);
  assert.equal(validate(hyperliquidPolicy, { max_order_usd: 100, max_daily_volume_usd: 500 }).length, 1);
  assert.deepEqual(validate(hyperliquidPolicy, { max_order_usd: 100, max_daily_volume_usd: 500, max_leverage: 3 }), []);
  assert.equal(validate(hyperliquidPolicy, { max_order_usd: 600, max_daily_volume_usd: 500, max_leverage: 3 }).length, 1);
});

test('a destination or a deposit cap without its switch is flagged', () => {
  assert.match(validate(hyperliquidPolicy, { withdraw_to: 'intents' }).join('\n'), /"Withdraw back" is off/);
  assert.match(validate(hyperliquidPolicy, { max_deposit_usd: 50 }).join('\n'), /"Fund the venue from the wallet" is off/);
  assert.match(validate(hyperliquidPolicy, { allow_withdraw: true, withdraw_to: 'nowhere' }).join('\n'), /Withdraw only to/);
  assert.deepEqual(validate(hyperliquidPolicy, { allow_withdraw: true, withdraw_to: '0x' + 'ab'.repeat(20) }), []);
});

test('coins and destinations are judged by the connector’s shapes', () => {
  assert.equal(coinProblem('BTC'), null);
  assert.equal(coinProblem('any'), null);
  assert.match(coinProblem('bit coin'), /not a coin symbol/);
  assert.equal(withdrawToProblem('confidential'), null);
  assert.match(withdrawToProblem('alice.near'), /HyperCore address/);
});

test('what the connector reports — nulls for absent fields — reads back as empty', () => {
  const { value, unknownKeys } = fromJson(hyperliquidPolicy, { present: true, max_order_usd: null, coins: null, allow_deposit: false, withdraw_to: null });
  assert.ok(isUnrestricted(value));
  assert.deepEqual(unknownKeys, ['present']);
});
