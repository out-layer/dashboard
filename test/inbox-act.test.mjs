import assert from 'node:assert/strict';
import test from 'node:test';
import { answerInput, asks, callOf, closedHeading, made, madeBy, readAnswer, unlockCall, waits } from '../lib/inbox/act.ts';

const envelope = { id: 'run-0', answer_by: { operation: 'confirm', supplies: 'nothing' } };
const outcome = (value) => ({ status: { SuccessValue: btoa(typeof value === 'string' ? value : JSON.stringify(value)) } });

test('an answer names the task, the hash shown and the operation the task names', () => {
  assert.deepEqual(answerInput(envelope, 'ab'.repeat(32), null), {
    operation: 'confirm',
    task_id: 'run-0',
    task_hash: 'ab'.repeat(32),
  });
  assert.equal(answerInput(envelope, 'h', 'c2VhbGVk').supplied, 'c2VhbGVk');
});

test('the call is of the project that made the task, on the owner\'s own row', () => {
  const call = callOf('connectors.outlayer.near/gmail', 'owner.near', 'gmail', 'ab'.repeat(32), { operation: 'confirm' });
  // The version is the build the task was made by: the one the proof checked.
  assert.deepEqual(call.source, { Project: { project_id: 'connectors.outlayer.near/gmail', version_key: 'ab'.repeat(32) } });
  assert.deepEqual(call.secrets_ref, { account_id: 'owner.near', profile: 'gmail' });
  assert.equal(call.input_data, '{"operation":"confirm"}');
});

test('opening the tasks of a project for this browser is one call of its active version', () => {
  const call = unlockCall('connectors.outlayer.near/gmail', 'owner.near', 'gmail');
  // No version named: the tasks are the project's, whatever build made each.
  assert.deepEqual(call.source, { Project: { project_id: 'connectors.outlayer.near/gmail' } });
  assert.deepEqual(call.secrets_ref, { account_id: 'owner.near', profile: 'gmail' });
  assert.equal(call.input_data, '{"operation":"tasks_unlock"}');
  assert.deepEqual(call.resource_limits, callOf('p', 'o', 'r', 'b', {}).resource_limits);
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

test('the form is headed by what the task asks, by its kind', () => {
  assert.equal(asks('confirm'), 'What the agent asks you to approve');
  assert.equal(asks('input'), 'What the agent asks you for');
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

test('what the owner supplied is sent when there is any, even when it is empty', () => {
  assert.ok(!('supplied' in answerInput(envelope, 'h', null)));
  assert.deepEqual(answerInput(envelope, 'h', ''), { operation: 'confirm', task_id: 'run-0', task_hash: 'h', supplied: '' });
  // The operation is the one the task names, whatever else the envelope holds.
  const other = { ...envelope, operation: 'send', answer_by: { operation: 'supply_photo', supplies: 'file' } };
  assert.equal(answerInput(other, 'h', null).operation, 'supply_photo');
});

test('the call names the build the task was made by, asks for JSON and holds the run to its limits', () => {
  const call = callOf('owner.near/app', 'owner.near', 'default', 'cd'.repeat(32), { operation: 'confirm', task_id: 'run-0', task_hash: 'h' });
  assert.deepEqual(Object.keys(call).sort(), ['input_data', 'resource_limits', 'response_format', 'secrets_ref', 'source']);
  assert.equal(call.source.Project.version_key, 'cd'.repeat(32));
  assert.equal(call.response_format, 'Json');
  assert.deepEqual(call.resource_limits, { max_instructions: 10000000000, max_memory_mb: 128, max_execution_seconds: 60 });
  assert.deepEqual(JSON.parse(call.input_data), { operation: 'confirm', task_id: 'run-0', task_hash: 'h' });
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

test('a task that is no longer open is headed by what became of it', () => {
  assert.equal(closedHeading('done'), 'A task carried out');
  assert.equal(closedHeading('rejected'), 'A task you rejected');
  assert.equal(closedHeading('cancelled'), 'A task the agent cancelled');
  assert.equal(closedHeading('expired'), 'A task that expired');
  assert.equal(closedHeading('failed'), 'A task whose run failed');
  assert.equal(closedHeading('void'), 'A task voided by a newer build');
  assert.equal(closedHeading('answering'), 'A task being carried out');
  // A state this build does not know is closed, and said no closer than that.
  assert.equal(closedHeading('unknown'), 'A closed task');
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
