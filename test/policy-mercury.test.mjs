// The Mercury policy as the editor writes and reads it. What matters: the JSON
// carries only the keys the connector knows and only the ones set; an empty
// policy is READ-ONLY and says so; payments need both amounts; the two
// switches and the rails grant rather than narrow; and a stored policy comes
// back into the same value. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mercuryPolicy, recipientIdProblem, mercuryStartingPolicy } from '../lib/policies/mercury.ts';
import { toJson, fromJson, validate, isUnrestricted, emptyValue } from '../lib/policies/policy.ts';

test('an empty policy is {} and is described as read-only, not as no limits', () => {
  assert.equal(toJson(mercuryPolicy, emptyValue()), '{}');
  assert.ok(isUnrestricted(emptyValue()));
  assert.match(mercuryPolicy.emptySummary, /read-only/);
  assert.equal(mercuryPolicy.summarize(emptyValue()), 'The agent cannot pay; it cannot issue or cancel invoices.');
});

test('only set fields reach the JSON, and they round-trip under the connector’s names', () => {
  const value = {
    max_payment_usd: 100,
    max_spend_usd_month: 500,
    allowed_recipients: ['rcp_1'],
    payment_methods: ['ach'],
    account_id: 'acc-1',
    allow_invoicing: true,
    allow_new_recipients: undefined,
    allowed_operations: [],
  };
  const json = toJson(mercuryPolicy, value);
  assert.deepEqual(JSON.parse(json), {
    max_payment_usd: 100,
    max_spend_usd_month: 500,
    allowed_recipients: ['rcp_1'],
    payment_methods: ['ach'],
    account_id: 'acc-1',
    allow_invoicing: true,
  });
  const back = fromJson(mercuryPolicy, json);
  assert.deepEqual(back.value, {
    max_payment_usd: 100,
    max_spend_usd_month: 500,
    allowed_recipients: ['rcp_1'],
    payment_methods: ['ach'],
    account_id: 'acc-1',
    allow_invoicing: true,
  });
  assert.deepEqual(back.unknownKeys, []);
  assert.equal(
    mercuryPolicy.summarize(back.value),
    'The agent may pay up to $100 per payment and $500 per 30 days by ACH from account acc-1, to 1 pinned payee; it may issue and cancel invoices.',
  );
});

test('what the connector reports — nulls for absent fields, present for the row — reads back as empty', () => {
  const reported = {
    present: true,
    max_payment_usd: null,
    max_spend_usd_month: null,
    payment_methods: null,
    allowed_operations: null,
    allowed_recipients: [],
    allow_new_recipients: false,
    allow_invoicing: false,
    account_id: null,
  };
  const { value, unknownKeys } = fromJson(mercuryPolicy, reported);
  assert.ok(isUnrestricted(value));
  assert.deepEqual(unknownKeys, ['present']);
});

test('one amount without the other cannot be saved — the connector would allow nothing', () => {
  assert.deepEqual(validate(mercuryPolicy, { max_payment_usd: 100 }), [
    'Set both "Most per payment" and "Budget per 30 days" — with one of them missing no payment runs',
  ]);
  assert.deepEqual(validate(mercuryPolicy, { max_payment_usd: 100, max_spend_usd_month: 500 }), []);
  assert.equal(validate(mercuryPolicy, { max_payment_usd: 600, max_spend_usd_month: 500 }).length, 1);
});

test('a pinned payee list and "add new payees" contradict each other, and the form says so', () => {
  const problems = validate(mercuryPolicy, { allowed_recipients: ['rcp_1'], allow_new_recipients: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /pinned to a list/);
});

test('an operation ticked without its gate is flagged before it is stored', () => {
  assert.match(validate(mercuryPolicy, { allowed_operations: ['pay_invoice'] }).join('\n'), /pay_invoice is ticked but there is no budget/);
  assert.match(validate(mercuryPolicy, { allowed_operations: ['add_recipient'] }).join('\n'), /add_recipient is ticked/);
  assert.match(validate(mercuryPolicy, { allowed_operations: ['send_invoice'] }).join('\n'), /Invoicing operations are ticked/);
  assert.deepEqual(validate(mercuryPolicy, { allowed_operations: ['accounts', 'transactions'] }), []);
});

test('a rail the connector does not know is refused, and the amounts must be whole dollars', () => {
  assert.equal(validate(mercuryPolicy, { payment_methods: ['wire'] }).length, 1);
  assert.equal(validate(mercuryPolicy, { max_payment_usd: 19.99, max_spend_usd_month: 500 }).length, 1);
});

test('a recipient id is one token', () => {
  assert.equal(recipientIdProblem('rcp_abc123'), null);
  assert.match(recipientIdProblem('two words'), /not a recipient id/);
  assert.match(recipientIdProblem(''), /not a recipient id/);
});

test('the starting policy spends nothing and pins the one account it was given', () => {
  assert.deepEqual(mercuryStartingPolicy(null), {});
  assert.deepEqual(mercuryStartingPolicy('acc-1'), { account_id: 'acc-1' });
  assert.equal(toJson(mercuryPolicy, mercuryStartingPolicy('acc-1')), '{"account_id":"acc-1"}');
});
