// The Polymarket policy as the editor writes and reads it: only set keys reach
// the JSON, an empty policy is READ-ONLY (plus cancel) and says so, orders need
// both sizes, and a stored policy comes back into the same value. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polymarketPolicy, marketProblem, withdrawToProblem } from '../lib/policies/polymarket.ts';
import { toJson, fromJson, validate, isUnrestricted, emptyValue } from '../lib/policies/policy.ts';

test('an empty policy is {} and is described as read-only', () => {
  assert.equal(toJson(polymarketPolicy, emptyValue()), '{}');
  assert.ok(isUnrestricted(emptyValue()));
  assert.match(polymarketPolicy.emptySummary, /read-only/);
  assert.equal(polymarketPolicy.summarize(emptyValue()), 'The agent cannot place orders; it can neither fund the venue nor withdraw.');
});

test('only set fields reach the JSON, under the connector’s names, and round-trip', () => {
  const value = { max_order_usd: 20, max_daily_volume_usd: 100, max_open_notional_usd: 60, markets: ['0x' + 'ab'.repeat(32)], allow_deposit: true, allow_withdraw: true };
  const json = toJson(polymarketPolicy, value);
  assert.deepEqual(JSON.parse(json), value);
  const back = fromJson(polymarketPolicy, json);
  assert.deepEqual(back.value, value);
  assert.deepEqual(back.unknownKeys, []);
  assert.equal(
    polymarketPolicy.summarize(value),
    'The agent may trade 1 named market up to $20 per order and $100 a day, with at most $60 open at once; it may fund the venue and withdraw to intents.',
  );
});

test('orders need both sizes', () => {
  assert.equal(validate(polymarketPolicy, { max_order_usd: 20 }).length, 1);
  assert.deepEqual(validate(polymarketPolicy, { max_order_usd: 20, max_daily_volume_usd: 100 }), []);
  assert.equal(validate(polymarketPolicy, { max_order_usd: 200, max_daily_volume_usd: 100 }).length, 1);
});

test('a destination or a deposit cap without its switch is flagged', () => {
  assert.match(validate(polymarketPolicy, { withdraw_to: 'alice.near' }).join('\n'), /"Withdraw back" is off/);
  assert.match(validate(polymarketPolicy, { max_deposit_usd: 50 }).join('\n'), /"Fund the venue from the wallet" is off/);
  assert.deepEqual(validate(polymarketPolicy, { allow_withdraw: true, withdraw_to: 'alice.near' }), []);
  assert.match(validate(polymarketPolicy, { allow_withdraw: true, withdraw_to: 'Not An Account' }).join('\n'), /Withdraw only to/);
});

test('markets and destinations are judged by the connector’s shapes', () => {
  assert.equal(marketProblem('any'), null);
  assert.equal(marketProblem('0x' + 'cd'.repeat(32)), null);
  assert.equal(marketProblem('71321045679252212594626385532706912750332728571942532289631379312455583992563'), null);
  assert.match(marketProblem('yes-token'), /neither a condition id/);
  assert.equal(withdrawToProblem('intents'), null);
  assert.equal(withdrawToProblem('a'.repeat(64)), null);
  // A lower-case hex string IS a well-formed NEAR account; upper case is not.
  assert.match(withdrawToProblem('0x' + 'AB'.repeat(20)), /NEAR account/);
});

test('what the connector reports — nulls for absent fields — reads back as empty', () => {
  const { value, unknownKeys } = fromJson(polymarketPolicy, { present: true, max_order_usd: null, markets: null, allow_deposit: false, withdraw_to: null });
  assert.ok(isUnrestricted(value));
  assert.deepEqual(unknownKeys, ['present']);
});
