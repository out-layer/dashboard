// Mercury's rules as the editor reads, writes and judges them — the same
// rules `connectors/mercury-connector/src/rules.rs` parses. What matters: a
// stored rule list survives a load and a save whole and in order; the table's
// manual column is a plain rule, added last so the conditional ones it falls
// back from still decide first; a rule the connector would refuse is refused
// here, in the owner's words; and the sentence says what waits and what is
// refused. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mercuryPolicy, MERCURY_RULES, ruleWords } from '../lib/policies/mercury.ts';
import { decide, decisionFields, decisionOf, fromJson, toJson, validate, ruleProblems } from '../lib/policies/policy.ts';

const m = mercuryPolicy;
const BUDGET = { max_payment_usd: 1000, max_spend_usd_month: 5000 };

test('the vocabulary is the connector’s: its operations, and the conditions each carries', () => {
  const rust = readFileSync(new URL('../../near-offshore/connectors/mercury-connector/src/rules.rs', import.meta.url), 'utf8');
  const ops = [...rust.slice(rust.indexOf('pub fn name(self)')).split('\n    }\n')[0].matchAll(/RuledOp::\w+ => "([a-z_]+)"/g)].map((x) => x[1]);
  assert.deepEqual(MERCURY_RULES.ops.map((o) => o.value).sort(), ops.sort());
  const when = rust.slice(rust.indexOf('pub struct When {'), rust.indexOf('pub struct Rule {'));
  const members = [...when.matchAll(/pub (\w+):/g)].map((x) => x[1]).filter((k) => k !== 'op');
  assert.deepEqual(MERCURY_RULES.conditions.map((c) => c.key).sort(), members.sort());
  assert.match(rust, /pub const MAX_RULES: usize = 50;/);
  assert.equal(MERCURY_RULES.max, 50);
});

test('stored rules load and save whole and in order', () => {
  const stored = {
    ...BUDGET,
    rules: [
      { when: { op: 'pay_invoice', methods: ['domesticWire'] }, then: 'ask' },
      { when: { op: 'pay_invoice', min_usd: 500 }, then: 'ask' },
      { when: { op: 'pay_invoice', payee: 'new' }, then: 'refuse' },
      { when: { op: 'cancel_invoice' }, then: 'ask' },
    ],
  };
  const { value, unknownKeys } = fromJson(m, JSON.stringify(stored));
  assert.deepEqual(unknownKeys, [], 'rules is a key the editor knows — never reported, never dropped');
  assert.deepEqual(JSON.parse(toJson(m, value)), stored);
  assert.deepEqual(validate(m, value), []);
  // What `status` reports for a policy without rules reads back as none.
  assert.equal(fromJson(m, { ...BUDGET, rules: null }).value.rules, undefined);
});

test('an emptied condition is no condition: it is not written', () => {
  const value = { ...BUDGET, rules: [{ when: { op: 'pay_invoice', min_usd: undefined, methods: [] }, then: 'ask' }] };
  assert.deepEqual(JSON.parse(toJson(m, value)).rules, [{ when: { op: 'pay_invoice' }, then: 'ask' }]);
});

test('the manual column is a plain rule, added after the conditional ones', () => {
  const d = decisionFields(m);
  assert.equal(d.ask.key, 'rules');
  assert.equal(d.allowed.key, 'allowed_operations');
  assert.deepEqual(d.rows.filter((r) => r.askable).map((r) => r.id).sort(), ['add_recipient', 'cancel_invoice', 'pay_invoice', 'send_invoice']);
  assert.ok(d.rows.filter((r) => !r.askable).every((r) => r.group === 'Read'), 'reads cannot wait');

  const conditional = { when: { op: 'pay_invoice', min_usd: 500 }, then: 'refuse' };
  let v = { ...BUDGET, rules: [conditional] };
  assert.equal(decisionOf(m, v, 'pay_invoice'), 'automatic', 'a conditional rule does not move the row');
  v = decide(m, v, 'pay_invoice', 'asked');
  assert.deepEqual(v.rules, [conditional, { when: { op: 'pay_invoice' }, then: 'ask' }], 'the fallback goes last');
  assert.equal(decisionOf(m, v, 'pay_invoice'), 'asked');
  assert.deepEqual(validate(m, v), []);
  v = decide(m, v, 'pay_invoice', 'automatic');
  assert.deepEqual(v.rules, [conditional], 'auto-approve drops only the plain rule');
  // A plain refuse rule reads as refused; refusing through the table removes the operation and its plain rule.
  assert.equal(decisionOf(m, { rules: [{ when: { op: 'send_invoice' }, then: 'refuse' }], allow_invoicing: true }, 'send_invoice'), 'refused');
  const off = decide(m, decide(m, BUDGET, 'cancel_invoice', 'asked'), 'cancel_invoice', 'refused');
  assert.equal(off.rules, undefined);
  assert.ok(!(off.allowed_operations ?? []).includes('cancel_invoice'));
  // Asking about an invoicing write turns its switch on, as allowing it does.
  assert.equal(decide(m, {}, 'send_invoice', 'asked').allow_invoicing, true);
});

test('what the connector would refuse is refused here, in the owner’s words', () => {
  const p = (rules) => ruleProblems(MERCURY_RULES, rules).join(' | ');
  assert.match(p([{ when: { op: 'cancel_invoice', min_usd: 1 }, then: 'ask' }]), /Rule 1: "from \$" does not apply to Cancelling an invoice/);
  assert.match(p([{ when: { op: 'send_invoice', methods: ['ach'] }, then: 'ask' }]), /Rule 1: "by" does not apply/);
  assert.match(p([{ when: { op: 'add_recipient', payee: 'new' }, then: 'ask' }]), /does not apply/);
  assert.match(p([{ when: { op: 'pay_invoice', min_usd: 10, max_usd: 5 }, then: 'ask' }]), /matches nothing/);
  assert.match(p([{ when: { op: 'pay_invoice', min_usd: 0 }, then: 'ask' }]), /at least \$0\.01/);
  assert.match(p([{ when: { op: 'pay_invoice', methods: ['wire'] }, then: 'ask' }]), /names something unknown/);
  assert.match(p([{ when: { op: 'pay', }, then: 'ask' }]), /not an operation/);
  assert.match(p([{ when: { op: 'pay_invoice' }, then: 'maybe' }]), /not an outcome/);
  assert.match(p([{ when: { op: 'pay_invoice' }, then: 'ask' }, { when: { op: 'pay_invoice', min_usd: 5 }, then: 'refuse' }]), /Rule 2 never decides anything: rule 1 already decides/);
  assert.match(p(Array.from({ length: 51 }, () => ({ when: { op: 'pay_invoice', min_usd: 1 }, then: 'ask' }))), /at most 50/);
  assert.match(validate(m, { rules: [{ when: { op: 'cancel_invoice' }, then: 'ask' }], allowed_operations: ['accounts'] }).join(' | '), /Rule 1 does nothing: cancel_invoice is not allowed/);
});

test('the sentence says what waits for the owner and what is refused', () => {
  assert.equal(ruleWords({ when: { op: 'pay_invoice', methods: ['domesticWire', 'internationalWire'], min_usd: 500, payee: 'new' }, then: 'ask' }),
    'payments by Domestic wire or International wire from $500 to new payees wait for you');
  assert.equal(ruleWords({ when: { op: 'add_recipient' }, then: 'refuse' }), 'new payees are refused');
  const said = m.summarize({ ...BUDGET, rules: [{ when: { op: 'pay_invoice', min_usd: 500 }, then: 'ask' }, { when: { op: 'cancel_invoice' }, then: 'ask' }] });
  assert.match(said, / Payments from \$500 wait for you; invoice cancellations wait for you\.$/);
  assert.doesNotMatch(m.summarize(BUDGET), /wait for you/);
});
