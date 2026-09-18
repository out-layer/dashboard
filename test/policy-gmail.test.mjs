// The Gmail policy as the editor writes and reads it. What matters: the JSON
// carries only the keys the connector knows and only the ones set (the
// connector refuses unknown keys, and absent is how "no limit" is spelled);
// a stored policy comes back into the same value; the sentence says what is
// PERMITTED; and an address is judged by the connector's own rule.
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gmailPolicy, bareAddressProblem, domainProblem } from '../lib/policies/gmail.ts';
import { toJson, fromJson, validate, isUnrestricted, emptyValue } from '../lib/policies/policy.ts';

test('an empty policy is {} — the widest there is — and says so', () => {
  assert.equal(toJson(gmailPolicy, emptyValue()), '{}');
  assert.ok(isUnrestricted(emptyValue()));
  assert.equal(
    gmailPolicy.summarize(emptyValue()),
    'The agent may write to anyone, any number of messages a day, any number of recipients per message, no attachments.',
  );
});

test('only set fields reach the JSON, and they round-trip', () => {
  const value = { recipient_domains: ['example.com'], max_per_day: 20, subject_prefix: '[agent]', recipients: [], max_recipients: undefined };
  const json = toJson(gmailPolicy, value);
  assert.deepEqual(JSON.parse(json), { recipient_domains: ['example.com'], max_per_day: 20, subject_prefix: '[agent]' });
  const back = fromJson(gmailPolicy, json);
  assert.deepEqual(back.value, { recipient_domains: ['example.com'], max_per_day: 20, subject_prefix: '[agent]' });
  assert.deepEqual(back.unknownKeys, []);
});

test('what the connector reports — nulls for absent fields — reads back as empty', () => {
  const reported = { present: true, recipient_domains: null, recipients: null, max_per_day: null, max_recipients: null, max_attachment_kb: null, subject_prefix: null };
  const { value, unknownKeys } = fromJson(gmailPolicy, reported);
  assert.ok(isUnrestricted(value));
  // `present` is the connector's word about the row, not a policy field.
  assert.deepEqual(unknownKeys, ['present']);
});

test('a key the schema does not know is reported, not dropped in silence', () => {
  const { unknownKeys } = fromJson(gmailPolicy, '{"max_per_day":3,"surprise":1}');
  assert.deepEqual(unknownKeys, ['surprise']);
});

test('the sentence states permissions, with the attachment rule the other way round', () => {
  const s = gmailPolicy.summarize({ recipient_domains: ['example.com'], recipients: ['boss@other.org'], max_per_day: 1, max_recipients: 5, max_attachment_kb: 2048, subject_prefix: '[agent]' });
  assert.equal(s, 'The agent may write to only anyone at example.com and boss@other.org, up to 1 message a day, 5 recipients per message, attachments up to 2048 KB; subjects get “[agent]”.');
  assert.match(gmailPolicy.summarize({ recipient_domains: ['any'], max_attachment_kb: undefined }), /write to anyone, .*no attachments\.$/);
});

test('addresses and domains are judged by the connector’s rule', () => {
  assert.equal(bareAddressProblem('boss@example.com'), null);
  for (const bad of ['Boss <boss@example.com>', 'a@b.co, c@d.co', 'victim@evil.com@example.com', 'boss', '@example.com', 'a b@example.com']) {
    assert.match(bareAddressProblem(bad) ?? '', /not a bare email address/, bad);
  }
  assert.equal(domainProblem('example.com'), null);
  assert.equal(domainProblem('any'), null);
  for (const bad of ['example', '-bad.com', 'ex ample.com', 'a..b']) {
    assert.match(domainProblem(bad) ?? '', /not a domain/, bad);
  }
  const errors = validate(gmailPolicy, { recipients: ['Boss <b@x.co>'], max_per_day: 0, max_attachment_kb: 1.5 });
  assert.equal(errors.length, 3, errors.join('\n'));
  assert.match(errors[0], /^Only these addresses: /);
  assert.match(errors[1], /^Messages a day: a whole number of at least 1/);
  assert.match(errors[2], /^Attachments up to: a whole number/);
});
