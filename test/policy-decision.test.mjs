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
import { decide, decisionFields, decisionOf, fields, toJson } from '../lib/policies/policy.ts';

const all = [githubPolicy, gmailPolicy, mercuryPolicy, hyperliquidPolicy, polymarketPolicy];

test('every schema has at most one ask field, in the same group as the actions it asks over', () => {
  for (const schema of all) {
    const asks = fields(schema).filter((f) => f.asks);
    assert.ok(asks.length <= 1, `${schema.connector}: ${asks.length} ask fields`);
    const d = decisionFields(schema);
    if (!d) continue;
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
  assert.equal(decisionFields(mercuryPolicy), null);
  assert.equal(decisionFields(hyperliquidPolicy), null);
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

test('a connector with nothing to ask decides nothing', () => {
  assert.equal(decisionOf(mercuryPolicy, {}, 'pay_invoice'), 'refused');
  const v = { max_payment_usd: 10 };
  assert.equal(decide(mercuryPolicy, v, 'pay_invoice', 'asked'), v);
});
