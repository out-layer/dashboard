// The decision table behind every policy page: one row per operation, three
// outcomes — refused, automatic, ask me first — and the invariant that an
// action asked about is an action allowed. What matters: the two columns
// exclude each other, refusing drops the ask, a connector with no
// allowed-actions field (Gmail) has two outcomes only, every change still goes
// through `change` so the switches follow, and the five schemas declare the
// table the editor expects. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubPolicy } from '../lib/policies/github.ts';
import { gmailPolicy } from '../lib/policies/gmail.ts';
import { mercuryPolicy } from '../lib/policies/mercury.ts';
import { hyperliquidPolicy } from '../lib/policies/hyperliquid.ts';
import { polymarketPolicy } from '../lib/policies/polymarket.ts';
import { decide, decisionFields, decisionOf, fields, toJson, validate } from '../lib/policies/policy.ts';

const all = [githubPolicy, gmailPolicy, mercuryPolicy, hyperliquidPolicy, polymarketPolicy];

test('every schema has at most one ask field, in the same group as the actions it asks over', () => {
  for (const schema of all) {
    const asks = fields(schema).filter((f) => f.asks);
    assert.ok(asks.length <= 1, `${schema.connector}: ${asks.length} ask fields`);
    const d = decisionFields(schema);
    if (!d?.ask) continue;
    assert.equal(d.ask.kind, 'choices');
    assert.ok(d.group.fields.includes(d.ask));
    if (d.allowed) {
      assert.ok(d.group.fields.includes(d.allowed), `${schema.connector}: the ask field and ${d.allowed.key} share a group`);
      // Every row that can be asked about is a row of the table.
      const rows = new Set(d.allowed.options.map((o) => o.value));
      for (const o of d.ask.options) assert.ok(rows.has(o.value), `${schema.connector}: ${o.value} can be asked about but is not an action`);
    }
  }
  assert.equal(decisionFields(githubPolicy).allowed.key, 'actions');
  assert.equal(decisionFields(gmailPolicy).allowed, undefined);
  assert.equal(decisionFields(mercuryPolicy).allowed.key, 'allowed_operations', 'Mercury: its operations are the rows');
  assert.equal(decisionFields(mercuryPolicy).ask, undefined);
  for (const s of [hyperliquidPolicy, polymarketPolicy]) {
    assert.deepEqual(
      decisionFields(s).rows.map((r) => r.id),
      ['orders', 'field:allow_deposit', 'field:allow_withdraw'],
      `${s.connector}: orders, then money in and out`,
    );
  }
});

test('only the trading connectors run open on an empty policy, and say so', () => {
  assert.deepEqual(
    all.filter((s) => s.emptyIsOpen).map((s) => s.connector),
    ['hyperliquid', 'polymarket'],
  );
  for (const s of all.filter((s) => s.emptyIsOpen)) assert.match(s.emptySummary, /built-in default/);
});

test('GitHub: the three outcomes, and the columns exclude each other', () => {
  const g = githubPolicy;
  let v = { repos: ['a/b'], max_writes_per_day: 5 };
  assert.equal(decisionOf(g, v, 'gist_create'), 'refused');
  v = decide(g, v, 'gist_create', 'automatic');
  assert.equal(decisionOf(g, v, 'gist_create'), 'automatic');
  assert.deepEqual(v.actions, ['gist_create']);
  // Asking moves it out of "automatically" and keeps it allowed.
  v = decide(g, v, 'gist_create', 'asked');
  assert.equal(decisionOf(g, v, 'gist_create'), 'asked');
  assert.deepEqual(v.actions, ['gist_create']);
  assert.deepEqual(v.confirm, ['gist_create']);
  // Back to automatic: allowed, no longer asked.
  v = decide(g, v, 'gist_create', 'automatic');
  assert.equal(decisionOf(g, v, 'gist_create'), 'automatic');
  assert.equal(v.confirm, undefined);
  // Refusing drops both.
  v = decide(g, decide(g, v, 'gist_create', 'asked'), 'gist_create', 'refused');
  assert.equal(decisionOf(g, v, 'gist_create'), 'refused');
  assert.equal(v.actions, undefined);
  assert.equal(v.confirm, undefined);
});

test('GitHub: asking about an action the policy refuses allows it, switches included', () => {
  const g = githubPolicy;
  const v = decide(g, { actions: ['issue_get'], repos: ['a/b'], max_writes_per_day: 5 }, 'pr_merge', 'asked');
  assert.deepEqual(v.actions, ['issue_get', 'pr_merge'], 'in the vocabulary’s order');
  assert.deepEqual(v.confirm, ['pr_merge']);
  assert.equal(v.allow_merge, true, 'merge does nothing without its switch, so the switch follows');
  // Refusing the merge turns the switch back off.
  const refused = decide(g, v, 'pr_merge', 'refused');
  assert.equal(refused.allow_merge, undefined);
  assert.equal(refused.confirm, undefined);
});

test('GitHub: a read cannot be asked about — the ask field does not offer it', () => {
  const d = decisionFields(githubPolicy);
  const askable = new Set(d.ask.options.map((o) => o.value));
  for (const o of d.allowed.options.filter((o) => o.group === 'Read')) assert.ok(!askable.has(o.value), o.value);
});

test('Gmail: every send is automatic unless asked about; refusing is not an outcome here', () => {
  const g = gmailPolicy;
  assert.equal(decisionOf(g, {}, 'send'), 'automatic');
  const asked = decide(g, {}, 'send', 'asked');
  assert.deepEqual(asked, { confirm: ['send'] });
  assert.equal(decisionOf(g, asked, 'send'), 'asked');
  assert.deepEqual(decide(g, asked, 'send', 'automatic'), { confirm: undefined });
  assert.equal(toJson(g, decide(g, asked, 'send', 'automatic')), '{}');
  assert.equal(decisionOf(g, decide(g, asked, 'send', 'refused'), 'send'), 'automatic');
});

test('Mercury: every operation is a row; a switch that is one decision with its operation follows it', () => {
  const m = mercuryPolicy;
  const d = decisionFields(m);
  assert.ok(d.rows.every((r) => r.refusable && !r.askable), 'nothing waits for the owner: no manual column');
  // Empty allows every operation — but one that needs its switch is refused while the switch is off.
  assert.equal(decisionOf(m, {}, 'accounts'), 'automatic');
  assert.equal(decisionOf(m, {}, 'add_recipient'), 'refused');
  assert.equal(decisionOf(m, {}, 'send_invoice'), 'refused');
  // Payments are allowed and need both amounts: the row says what it waits for.
  assert.equal(decisionOf(m, {}, 'pay_invoice'), 'automatic');
  assert.deepEqual(d.rows.find((r) => r.id === 'pay_invoice').needs, ['max_payment_usd', 'max_spend_usd_month']);
  // Ticking add_recipient turns its switch on; refusing it turns the switch off again.
  const added = decide(m, {}, 'add_recipient', 'automatic');
  assert.equal(added.allow_new_recipients, true);
  assert.equal(decisionOf(m, added, 'add_recipient'), 'automatic');
  const removed = decide(m, added, 'add_recipient', 'refused');
  assert.equal(decisionOf(m, removed, 'add_recipient'), 'refused');
  assert.equal(removed.allow_new_recipients, undefined);
  // Invoicing: one switch, two operations — it stays on while either is allowed.
  let inv = decide(m, decide(m, {}, 'send_invoice', 'automatic'), 'cancel_invoice', 'automatic');
  assert.equal(inv.allow_invoicing, true);
  inv = decide(m, inv, 'send_invoice', 'refused');
  assert.equal(inv.allow_invoicing, true, 'cancel is still allowed');
  assert.equal(decisionOf(m, inv, 'cancel_invoice'), 'automatic');
  inv = decide(m, inv, 'cancel_invoice', 'refused');
  assert.equal(inv.allow_invoicing, undefined);
  // Asking is not offered: it reads as allowing.
  assert.equal(decisionOf(m, decide(m, { allowed_operations: ['accounts'] }, 'recipients', 'asked'), 'recipients'), 'automatic');
});

test('Hyperliquid and Polymarket: orders are made of their limits; money in and out are switches', () => {
  for (const [s, caps] of [
    [hyperliquidPolicy, { max_order_usd: 100, max_daily_volume_usd: 500, max_leverage: 3 }],
    [polymarketPolicy, { max_order_usd: 10, max_daily_volume_usd: 50 }],
  ]) {
    assert.equal(decisionOf(s, {}, 'orders'), 'refused', `${s.connector}: no limits, no orders under own rules`);
    assert.equal(decisionOf(s, caps, 'orders'), 'automatic');
    // Ticking cannot invent amounts; unticking clears them.
    assert.deepEqual(decide(s, {}, 'orders', 'automatic'), {});
    const off = decide(s, { ...caps, allow_deposit: true }, 'orders', 'refused');
    for (const k of Object.keys(caps)) assert.equal(off[k], undefined, `${s.connector}: ${k} cleared`);
    assert.equal(off.allow_deposit, true, 'money in and out untouched');
    assert.equal(decisionOf(s, decide(s, {}, 'field:allow_withdraw', 'automatic'), 'field:allow_withdraw'), 'automatic');
    assert.deepEqual(decide(s, { allow_withdraw: true }, 'field:allow_withdraw', 'refused'), { allow_withdraw: undefined });
    assert.equal(decisionFields(s).rows.find((r) => r.id === 'orders').derived, true);
  }
  // The owner's own rules start from the default's permissions, not from nothing.
  assert.deepEqual(hyperliquidPolicy.ownStart, { allow_deposit: true, allow_withdraw: true, withdraw_to: 'intents' });
  assert.deepEqual(polymarketPolicy.ownStart, { allow_deposit: true, allow_withdraw: true });
  assert.deepEqual(validate(polymarketPolicy, polymarketPolicy.ownStart), []);
  assert.deepEqual(validate(hyperliquidPolicy, hyperliquidPolicy.ownStart), []);
});

test('Gmail: Attach files is a row of its own — the attachment size grants by being set', () => {
  const g = gmailPolicy;
  const d = decisionFields(g);
  assert.deepEqual(
    d.rows.map((r) => [r.id, r.label, r.group, r.refusable, r.askable]),
    [
      ['send', 'Send a message', 'Mail', false, true],
      ['field:max_attachment_kb', 'Attach files', 'Mail', true, false],
    ],
  );
  const id = 'field:max_attachment_kb';
  assert.equal(decisionOf(g, {}, id), 'refused', 'no size: no files, as the connector reads it');
  const on = decide(g, {}, id, 'automatic');
  assert.deepEqual(on, { max_attachment_kb: 2048 });
  assert.equal(decisionOf(g, on, id), 'automatic');
  // A size the owner typed is kept when the row is ticked again.
  assert.deepEqual(decide(g, { max_attachment_kb: 500 }, id, 'automatic'), { max_attachment_kb: 500 });
  assert.equal(decisionOf(g, { max_attachment_kb: 500 }, id), 'automatic', 'typing a size ticks the row');
  assert.equal(decide(g, on, id, 'refused').max_attachment_kb, undefined);
  assert.equal(toJson(g, decide(g, on, id, 'refused')), '{}');
  // It cannot wait on its own: asking reads as allowing.
  assert.deepEqual(decide(g, {}, id, 'asked'), { max_attachment_kb: 2048 });
  // Send and files are independent rows.
  const both = decide(g, decide(g, {}, 'send', 'asked'), id, 'automatic');
  assert.deepEqual(JSON.parse(toJson(g, both)), { max_attachment_kb: 2048, confirm: ['send'] });
});
