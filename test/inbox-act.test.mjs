import assert from 'node:assert/strict';
import test from 'node:test';
import { PROVENANCE_LEGEND, approvalSentence, asks, failureWords, linesOf, made, madeBy, provenance, readAnswer, rowsOf, shortTaskId, supplyDigest, unlockCall, waits } from '../lib/inbox/act.ts';

const outcome = (value) => ({ status: { SuccessValue: btoa(typeof value === 'string' ? value : JSON.stringify(value)) } });

test('opening the tasks of a project for this browser is one call of its active version', () => {
  const call = unlockCall('connectors.outlayer.near/gmail', 'owner.near', 'gmail');
  // No version named: the tasks are the project's, whatever build made each.
  assert.deepEqual(call.source, { Project: { project_id: 'connectors.outlayer.near/gmail' } });
  assert.deepEqual(call.secrets_ref, { account_id: 'owner.near', profile: 'gmail' });
  assert.equal(call.input_data, '{"operation":"tasks_unlock"}');
  assert.deepEqual(Object.keys(call).sort(), ['input_data', 'resource_limits', 'response_format', 'secrets_ref', 'source']);
  assert.equal(call.response_format, 'Json');
  assert.deepEqual(call.resource_limits, { max_instructions: 10000000000, max_memory_mb: 128, max_execution_seconds: 60 });
});

const ID = '0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0';
const HASH = 'ab'.repeat(32);
/** The digest of nothing said: `{"note":null,"supplied":null}`, as the coordinator's and the enclave's tests have it. */
const NOTHING_SAID = '93121736c33115cb57757d3d5c09b430c4a03d2c3fa06dbbda48a466620b5799';

test('the approval is one sentence naming the task, the hash shown and the digest of what was said, to the second in UTC', async () => {
  const digest = await supplyDigest(null, null);
  assert.equal(
    approvalSentence('alice.near', ID, HASH, digest, 1793275200),
    `Approve in OutLayer as alice.near: task ${ID} with hash ${HASH} and supply ${NOTHING_SAID}. At 2026-10-29T12:00:00Z.`,
  );
  assert.match(approvalSentence('o.near', ID, HASH, digest, 0), /\. At 1970-01-01T00:00:00Z\.$/);
  // One shape: nothing parses it, both sides rebuild it and compare bytes.
  assert.equal(approvalSentence('o.near', ID, HASH, digest, 1793275200).split(' ').length, 15);
});

test('the digest is of one canonical document, the vectors the coordinator and the enclave hold', async () => {
  const of = async (text) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) => b.toString(16).padStart(2, '0')).join('');
  assert.equal(await supplyDigest(null, null), NOTHING_SAID);
  assert.equal(await supplyDigest(null, null), await of('{"note":null,"supplied":null}'));
  assert.equal(await supplyDigest('YWJj', null), await of('{"note":null,"supplied":"YWJj"}'));
  assert.equal(await supplyDigest('YWJj', 'aGk='), await of('{"note":"aGk=","supplied":"YWJj"}'));
  assert.equal(await supplyDigest(null, 'aGk='), await of('{"note":"aGk=","supplied":null}'));
  assert.notEqual(await supplyDigest('YWJj', null), await supplyDigest(null, 'YWJj'), 'a note is not a supply');
  assert.match(await supplyDigest(null, null), /^[0-9a-f]{64}$/);
});

test('why a task failed is said in words, and a reason this build does not know is said as it came', () => {
  assert.equal(failureWords('preparer_key_unavailable'), "the agent's payment key could not pay for the run");
  assert.equal(failureWords('run_not_started'), 'no worker started the run in time');
  assert.equal(failureWords('run_refused:hash-mismatch'), 'the task the run holds is not the one you approved');
  assert.equal(failureWords('run_refused:approval-invalid'), 'your approval did not verify in the enclave');
  assert.equal(failureWords('run_refused:void'), 'the policy changed since the task was made');
  assert.equal(failureWords('run_refused:unreadable'), 'the run refused the task (unreadable)');
  assert.equal(failureWords('run_refused:unavailable'), 'the run could not reach the store or the chain');
  assert.equal(failureWords('run_refused:not-found'), 'the run found no such task');
  assert.equal(failureWords('something_new'), 'something_new');
  assert.equal(failureWords(undefined), 'the run did not finish the task');
  assert.equal(failureWords(null), 'the run did not finish the task');
  for (const reason of ['operation_priced', 'operation_unknown', 'operation_limit_reached', 'wallet_unresolved', 'queue_unavailable']) {
    assert.notEqual(failureWords(reason), reason, reason);
  }
});

test('the project\'s answer is a result or a refusal, never a guess', () => {
  assert.deepEqual(readAnswer(outcome({ success: true, output: { status: 'done' }, error: null })), {
    ok: true,
    output: { status: 'done' },
  });
  assert.deepEqual(readAnswer(outcome({ success: false, output: null, error: 'task_closed: the task is rejected' })), {
    ok: false,
    refusal: 'task_closed: the task is rejected',
  });
  // An answer doubly encoded, as some wallets return it.
  assert.equal(readAnswer(outcome(JSON.stringify(JSON.stringify({ success: true, output: 1 })))).ok, true);
  for (const broken of [null, undefined, {}, { status: {} }, { status: { SuccessValue: '' } }, outcome('not json'), outcome('null'), outcome({ output: { status: 'done' } }), outcome({ success: 'true' })]) {
    assert.equal(readAnswer(broken).ok, false, JSON.stringify(broken));
  }
});

test('how long a task waits is said in words', () => {
  assert.equal(waits(1000, 1000), 'past its life');
  assert.equal(waits(1000 + 30, 1000), '1 min left');
  assert.equal(waits(1000 + 1800, 1000), '30 min left');
  assert.equal(waits(1000 + 7200, 1000), '2 h left');
});

test('the form is headed by who prepared it from what the agent asked, by the task\'s kind', () => {
  // `Prepared by <project> from what agent <preparer> …`
  assert.equal(asks('confirm'), 'asked');
  assert.equal(asks('input'), 'asks you for');
});

test('a field is marked by who wrote it, and the legend names both marks', () => {
  assert.deepEqual(provenance('agent'), { mark: '🤖', title: 'written by the agent' });
  assert.deepEqual(provenance('project'), { mark: '⚙', title: 'filled in by the connector' });
  assert.equal(PROVENANCE_LEGEND, '🤖 written by the agent · ⚙ filled in by the connector');
});

test('a text area is sized to its lines, between its least and twelve', () => {
  assert.equal(rowsOf(0), 3);
  assert.equal(rowsOf(3), 3);
  assert.equal(rowsOf(7), 7);
  assert.equal(rowsOf(12), 12);
  assert.equal(rowsOf(40), 12);
  // A list is as tall as its values, and one row when it has none.
  assert.equal(rowsOf(0, 1), 1);
  assert.equal(rowsOf(2, 1), 2);
  assert.equal(rowsOf(30, 1), 12);
  assert.equal(linesOf(''), 1);
  assert.equal(linesOf('one'), 1);
  assert.equal(linesOf('one\ntwo\n'), 3);
});

test('when a task was made is said in the browser\'s own words', () => {
  const at = 1_700_000_000;
  assert.equal(made(at), `made ${new Date(at * 1000).toLocaleString()}`);
  assert.match(made(at), /^made \S/);
});

const encoded = (text) => ({ status: { SuccessValue: Buffer.from(text, 'utf8').toString('base64') } });

test('each way an answer is missing is said in its own words', () => {
  const none = 'The transaction finished without an answer from the project.';
  assert.deepEqual(readAnswer(null), { ok: false, refusal: none });
  assert.deepEqual(readAnswer({ status: { Failure: { ActionError: {} } } }), { ok: false, refusal: none });
  assert.deepEqual(readAnswer({ status: { SuccessValue: 7 } }), { ok: false, refusal: none });
  const notJson = 'The project answered with something that is not JSON.';
  assert.deepEqual(readAnswer(encoded('<html>')), { ok: false, refusal: notJson });
  assert.deepEqual(readAnswer({ status: { SuccessValue: 'not base64 !' } }), { ok: false, refusal: notJson });
  assert.deepEqual(readAnswer(encoded(JSON.stringify('a string that is no JSON'))), { ok: false, refusal: notJson });
  const notAnswer = 'The project answered with something that is not an answer.';
  for (const text of ['null', '7', 'true', '"7"']) assert.deepEqual(readAnswer(encoded(text)), { ok: false, refusal: notAnswer }, text);
});

test('a refusal without words of its own is still a refusal', () => {
  const refused = { ok: false, refusal: 'The project refused the call.' };
  for (const answer of [{ success: false }, { success: false, error: '' }, { success: false, error: null }, { success: false, error: { code: 7 } }, { error: 7 }, {}, [], { success: 1, output: 'done' }]) {
    assert.deepEqual(readAnswer(encoded(JSON.stringify(answer))), refused, JSON.stringify(answer));
  }
  // The words of a refusal are the project's, and an output beside them is not a result.
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: false, error: 'task_closed', output: { status: 'done' } }))), {
    ok: false,
    refusal: 'task_closed',
  });
});

test('an answer that succeeded with nothing to say has the output null', () => {
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: true }))), { ok: true, output: null });
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: true, output: null }))), { ok: true, output: null });
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: true, output: 0 }))), { ok: true, output: 0 });
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: true, output: '' }))), { ok: true, output: '' });
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: true, output: false, error: 'ignored' }))), { ok: true, output: false });
});

test('an answer is read as UTF-8', () => {
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: true, output: 'отправлено ✓' }))), { ok: true, output: 'отправлено ✓' });
  assert.deepEqual(readAnswer(encoded(JSON.stringify({ success: false, error: 'задача закрыта' }))), { ok: false, refusal: 'задача закрыта' });
});

test('a task waits in minutes under an hour and in hours from it, and never less than a minute', () => {
  assert.equal(waits(1000, 2000), 'past its life');
  assert.equal(waits(1001, 1000), '1 min left');
  assert.equal(waits(1000 + 89, 1000), '1 min left');
  assert.equal(waits(1000 + 90, 1000), '2 min left');
  assert.equal(waits(1000 + 3599, 1000), '60 min left');
  assert.equal(waits(1000 + 3600, 1000), '1 h left');
  assert.equal(waits(1000 + 86400, 1000), '24 h left');
});

test('a task is named by the first eight characters of its id', () => {
  assert.equal(shortTaskId('7c1d0f2e-1b4e-4c0a-9f4d-3a2b1c0d9e8f'), '7c1d0f2e');
  assert.equal(shortTaskId('run-0'), 'run-0');
  assert.equal(shortTaskId(''), '');
});

test('the door of a run is read off its id as the coordinator reads it', () => {
  assert.deepEqual(madeBy('req-7'), { door: 'chain', request_id: 7 });
  assert.deepEqual(madeBy('req-2008'), { door: 'chain', request_id: 2008 });
  assert.deepEqual(madeBy('7c1d0f2e-1b4e-4c0a-9f4d-3a2b1c0d9e8f'), { door: 'https', call_id: '7c1d0f2e-1b4e-4c0a-9f4d-3a2b1c0d9e8f' });
  // `req-` and no number names no request; an empty id names nothing.
  assert.equal(madeBy('req-x'), null);
  assert.equal(madeBy('req-'), null);
  assert.equal(madeBy('req--1'), null);
  assert.equal(madeBy(''), null);
});
