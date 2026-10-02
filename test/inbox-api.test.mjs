// The inbox API as the page calls it, with `fetch` replaced: what is asked
// (method, path, bearer, body) and how an answer or a refusal is read.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InboxRefused, acknowledgeTask, approveTask, attestationOf, deleteTask, deleteTasks, deleteWebhook, listDevices, listMutes, listTasks, mute,
  pendingApprovals, rejectTask, setWebhook, signIn, signOut, taskFile, taskOrigin, unmute, webhook,
} from '../lib/inbox/api.ts';

const BASE = 'https://coordinator.invalid';
const TOKEN = 'session-token-of-the-test';

const json = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Run `work` with `fetch` replaced by `respond`; what was asked is returned with what `work` made. */
async function asked(respond, work) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    return respond(String(url), init);
  };
  try {
    const result = await work();
    return { calls, result };
  } finally {
    globalThis.fetch = real;
  }
}

/** The refusal `work` ends in, with `fetch` answering `status` and `body`. */
async function refused(status, body, work = () => listTasks(BASE, TOKEN)) {
  let thrown = null;
  await asked(
    () => json(status, body),
    () => work().then(
      (value) => assert.fail(`read as a success: ${JSON.stringify(value)}`),
      (e) => {
        thrown = e;
      },
    ),
  );
  assert.ok(thrown instanceof InboxRefused, `${status} ${JSON.stringify(body)} is an InboxRefused`);
  assert.equal(thrown.status, status);
  return thrown;
}

const task = (over = {}) => ({
  id: 'run-0',
  project_id: 'connectors.outlayer.near/gmail',
  project_uuid: 'p0000000000000001',
  preparer: 'agent.near',
  profile: 'gmail',
  kind: 'confirm',
  state: 'open',
  created_at: 1790000000,
  expires_at: 1790003600,
  reply_pubkey: 'p256:abc',
  content: null,
  device_copy: null,
  locked: true,
  ...over,
});

const WHOLE_WEBHOOK = { url: 'https://example.com/h', set_at: 1790000000, set_by_key: 'ed25519:abc', set_here: true };
const NO_WEBHOOK = { url: null, set_at: null, set_by_key: null, set_here: false };

// E8

test('a state the page does not know is unknown, and never open', async () => {
  const states = ['paused', 'OPEN', 'open ', '', null, undefined, 7, true, ['open'], { open: true }];
  const { result } = await asked(
    () => json(200, { tasks: states.map((state, i) => task({ id: `run-${i}`, state })), more: false }),
    () => listTasks(BASE, TOKEN),
  );
  assert.equal(result.tasks.length, states.length);
  for (const [i, read] of result.tasks.entries()) {
    assert.equal(read.state, 'unknown', JSON.stringify(states[i]));
    assert.equal(read.id, `run-${i}`, 'the rest of the row is kept');
  }
  assert.equal(result.tasks.filter((t) => t.state === 'open').length, 0);
});

test('every state the page knows is read as it came', async () => {
  const states = ['open', 'approved', 'answering', 'done', 'failed', 'rejected', 'cancelled', 'expired', 'void'];
  const { result } = await asked(
    () => json(200, { tasks: states.map((state) => task({ state })), more: true }),
    () => listTasks(BASE, TOKEN),
  );
  assert.deepEqual(result.tasks.map((t) => t.state), states);
  assert.equal(result.more, true);
});

test('the inbox is asked for what waits or for what closed, with the bearer', async () => {
  const waiting = await asked(() => json(200, { tasks: [], more: false }), () => listTasks(BASE, TOKEN));
  assert.deepEqual(waiting.result, { tasks: [], more: false });
  assert.equal(waiting.calls.length, 1);
  assert.equal(waiting.calls[0].url, `${BASE}/inbox/tasks?show=waiting`);
  assert.equal(waiting.calls[0].method, 'GET');
  assert.deepEqual(waiting.calls[0].headers, { Authorization: `Bearer ${TOKEN}` });
  assert.equal(waiting.calls[0].body, undefined);
  const closed = await asked(() => json(200, { tasks: [], more: false }), () => listTasks(BASE, TOKEN, 'closed'));
  assert.equal(closed.calls[0].url, `${BASE}/inbox/tasks?show=closed`);
});

test('a reason the page does not know is kept as it came, and the refusal is not a success', async () => {
  const held = await refused(409, { error: 'The task is on hold.', reason: 'task_on_hold' });
  assert.equal(held.reason, 'task_on_hold');
  assert.equal(held.message, 'The task is on hold.');
  assert.equal(held.sessionEnded, false);
  assert.equal(held.terminal, true);
  const again = await refused(409, { error: 'Ask again.', reason: 'Some-Other_reason 2', terminal: false });
  assert.equal(again.reason, 'Some-Other_reason 2');
  assert.equal(again.terminal, false, 'what the API says of `terminal` is taken');
});

test('a refusal of the wallet\'s routes is read with its code as the reason', async () => {
  const gone = await refused(404, { error: 'wallet_not_found', message: 'No such wallet.' }, () =>
    pendingApprovals(BASE, TOKEN, 'ed25519:abc'));
  assert.equal(gone.reason, 'wallet_not_found');
  assert.equal(gone.message, 'No such wallet.');
  assert.equal(gone.terminal, true);
  const over = await refused(401, { error: 'session_required', message: 'Sign in.' }, () =>
    pendingApprovals(BASE, TOKEN, 'ed25519:abc'));
  assert.equal(over.sessionEnded, true);
  assert.equal(over.sessionReplaced, false);
});

test('a refusal that names no reason has the reason unknown, and a sentence of its own', async () => {
  for (const body of [{ error: 'Something went wrong.' }, { message: 'Something went wrong.' }, {}, [], 7, { reason: 7, error: 9 }]) {
    const e = await refused(400, body);
    assert.equal(e.reason, 'unknown', JSON.stringify(body));
    assert.ok(e.message.length > 0, JSON.stringify(body));
    assert.equal(e.sessionEnded, false);
  }
  assert.equal((await refused(400, { reason: 'invalid_request' })).message, 'The request was refused (400).');
  assert.equal((await refused(400, { reason: 'invalid_request', error: '' })).message, 'The request was refused (400).');
});

test('a session that is over and one that was replaced both end the session, and only the second says it was replaced', async () => {
  const over = await refused(401, { error: 'Sign in to read the inbox.', reason: 'session_required' });
  assert.equal(over.reason, 'session_required');
  assert.equal(over.sessionEnded, true);
  assert.equal(over.sessionReplaced, false);
  const replaced = await refused(401, { error: 'You signed in on another device.', reason: 'session_replaced' });
  assert.equal(replaced.reason, 'session_replaced');
  assert.equal(replaced.sessionEnded, true);
  assert.equal(replaced.sessionReplaced, true);
  assert.equal(replaced.message, 'You signed in on another device.');
});

test('a 401 with another reason does not end the session', async () => {
  const other = await refused(401, { error: 'The statement is not valid.', reason: 'invalid_statement' }, () =>
    signIn(BASE, { account_id: 'owner.near' }));
  assert.equal(other.sessionEnded, false);
  assert.equal(other.sessionReplaced, false);
});

test('a 503 is not terminal', async () => {
  const down = await refused(503, { error: 'Try again shortly.', reason: 'upstream_unavailable' });
  assert.equal(down.reason, 'upstream_unavailable');
  assert.equal(down.terminal, false);
  assert.equal(down.sessionEnded, false);
  assert.equal((await refused(503, '<html>Service Unavailable</html>')).terminal, false, 'with a body that is not JSON');
  assert.equal((await refused(503, '')).terminal, false, 'with no body');
  assert.equal((await refused(429, 'slow down')).terminal, false, 'a 429 that is not JSON');
  assert.equal((await refused(503, { error: 'Gone for good.', reason: 'x', terminal: true })).terminal, true, 'unless the API says so');
});

test('a body that is not JSON is a refusal with the reason unknown', async () => {
  const page = await refused(500, '<html><body>Internal Server Error</body></html>');
  assert.equal(page.reason, 'unknown');
  assert.equal(page.terminal, true);
  assert.equal(page.message, '<html><body>Internal Server Error</body></html>');
  const long = await refused(500, 'x'.repeat(5000));
  assert.equal(long.message.length, 200, 'no more of it than a line');
  const empty = await refused(404, '');
  assert.equal(empty.reason, 'unknown');
  assert.equal(empty.message, 'The request was refused (404).');
  // JSON that is no object is read the same way.
  assert.equal((await refused(500, 'null')).reason, 'unknown');
  assert.equal((await refused(500, '"session_required"')).sessionEnded, false);
});

test('an answer without tasks is a refusal, and never an empty inbox', async () => {
  for (const body of [{}, { more: false }, { tasks: null }, { tasks: {} }, { tasks: 'none' }, { task: [] }, null, [], 0]) {
    const e = await refused(200, body);
    assert.equal(e.reason, 'unknown', JSON.stringify(body));
    assert.equal(e.terminal, false, JSON.stringify(body));
    assert.equal(e.sessionEnded, false);
  }
});

test('an answer that is not JSON is a failure, and never an empty inbox', async () => {
  await asked(
    () => new Response('<html>ok</html>', { status: 200 }),
    () => assert.rejects(listTasks(BASE, TOKEN)),
  );
  await asked(
    () => new Response('', { status: 200 }),
    () => assert.rejects(listTasks(BASE, TOKEN)),
  );
});

test('a request that did not reach the API is a failure, and never an empty inbox', async () => {
  await asked(
    () => {
      throw new TypeError('fetch failed');
    },
    () => assert.rejects(listTasks(BASE, TOKEN), /fetch failed/),
  );
});

test('more is said only when the API says it', async () => {
  for (const more of [undefined, null, 'true', 1, false]) {
    const { result } = await asked(() => json(200, { tasks: [], more }), () => listTasks(BASE, TOKEN));
    assert.equal(result.more, false, JSON.stringify(more));
  }
});

// The session

test('signing in sends the statement and no bearer; signing out sends the bearer and nothing else', async () => {
  const statement = {
    account_id: 'owner.near', device_pubkey: 'p256:abc', valid_until: 1790000000,
    public_key: 'ed25519:abc', signature: 'c2ln', nonce: 'bm9uY2U=',
  };
  const session = { token: 't', device_id: 'd', account_id: 'owner.near', valid_until: 1790000000 };
  const entered = await asked(() => json(200, session), () => signIn(BASE, statement));
  assert.deepEqual(entered.result, session);
  assert.equal(entered.calls[0].url, `${BASE}/inbox/session`);
  assert.equal(entered.calls[0].method, 'POST');
  assert.deepEqual(entered.calls[0].headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(entered.calls[0].body), statement);

  const left = await asked(() => json(200, { revoked: true }), () => signOut(BASE, TOKEN));
  assert.equal(left.calls[0].url, `${BASE}/inbox/session`);
  assert.equal(left.calls[0].method, 'DELETE');
  assert.deepEqual(left.calls[0].headers, { Authorization: `Bearer ${TOKEN}` });
  assert.equal(left.calls[0].body, undefined);
});

test('Got it posts to the notice\'s route with the bearer and nothing else', async () => {
  const seen = await asked(() => json(200, { id: 'run-0', state: 'done' }), () => acknowledgeTask(BASE, TOKEN, 'run-0'));
  assert.deepEqual(seen.result, { id: 'run-0', state: 'done' });
  assert.equal(seen.calls.length, 1);
  assert.equal(seen.calls[0].url, `${BASE}/inbox/tasks/run-0/acknowledge`);
  assert.equal(seen.calls[0].method, 'POST');
  assert.deepEqual(seen.calls[0].headers, { Authorization: `Bearer ${TOKEN}` });
  assert.equal(seen.calls[0].body, undefined);
  const odd = await asked(() => json(200, { id: 'a/b', state: 'done' }), () => acknowledgeTask(BASE, TOKEN, 'a/b?x'));
  assert.equal(odd.calls[0].url, `${BASE}/inbox/tasks/a%2Fb%3Fx/acknowledge`);
});

test('a listed notice is read with no reply key', async () => {
  const notice = { id: 'run-0', kind: 'notice', state: 'open', reply_pubkey: null };
  const read = await asked(() => json(200, { tasks: [notice], more: false }), () => listTasks(BASE, TOKEN));
  assert.equal(read.result.tasks[0].kind, 'notice');
  assert.equal(read.result.tasks[0].reply_pubkey, null);
});

// The settings screen

test('deleting tasks builds the query from what it is given and from nothing else', async () => {
  const cases = [
    [undefined, '/inbox/tasks'],
    [{}, '/inbox/tasks'],
    [{ preparer: 'agent.near' }, '/inbox/tasks?preparer=agent.near'],
    [{ project_uuid: 'p0000000000000a1f' }, '/inbox/tasks?project_uuid=p0000000000000a1f'],
    [{ preparer: 'agent.near', project_uuid: 'p0000000000000a1f' }, '/inbox/tasks?preparer=agent.near&project_uuid=p0000000000000a1f'],
    [{ project_uuid: 'p0000000000000a1f', preparer: 'agent.near' }, '/inbox/tasks?preparer=agent.near&project_uuid=p0000000000000a1f'],
    // What names nobody narrows nothing, and a member the call does not know is not sent.
    [{ preparer: '', project_uuid: '' }, '/inbox/tasks'],
    [{ preparer: undefined, project_uuid: undefined }, '/inbox/tasks'],
    [{ preparer: 'agent.near', state: 'open', show: 'closed', id: 'run-0' }, '/inbox/tasks?preparer=agent.near'],
  ];
  for (const [only, path] of cases) {
    const { calls, result } = await asked(() => json(200, { deleted: 3 }), () => deleteTasks(BASE, TOKEN, only));
    assert.deepEqual(result, { deleted: 3 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BASE}${path}`, JSON.stringify(only));
    assert.equal(calls[0].method, 'DELETE');
    assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(calls[0].body, undefined);
  }
});

test('what narrows a delete cannot write a query of its own', async () => {
  const { calls } = await asked(
    () => json(200, { deleted: 0 }),
    () => deleteTasks(BASE, TOKEN, { preparer: 'agent.near&project_uuid=p0000000000000001#x' }),
  );
  const url = new URL(calls[0].url);
  assert.deepEqual([...url.searchParams.keys()], ['preparer']);
  assert.equal(url.searchParams.get('preparer'), 'agent.near&project_uuid=p0000000000000001#x');
  assert.equal(url.hash, '');
});

test('a delete that is refused is a refusal, and says nothing was deleted', async () => {
  const e = await refused(401, { error: 'Sign in.', reason: 'session_required' }, () => deleteTasks(BASE, TOKEN));
  assert.equal(e.sessionEnded, true);
});

const SIGNED = { at: 1790000000, public_key: 'ed25519:abc', signature: 'c2ln', nonce: 'bm9uY2U=' };

test('the webhook is read, named and removed at one path, by GET, PUT and DELETE, the last two signed', async () => {
  const read = await asked(() => json(200, WHOLE_WEBHOOK), () => webhook(BASE, TOKEN));
  assert.deepEqual(read.result, WHOLE_WEBHOOK);
  assert.deepEqual(
    [read.calls[0].method, read.calls[0].url, read.calls[0].body],
    ['GET', `${BASE}/inbox/webhook`, undefined],
  );
  assert.deepEqual(read.calls[0].headers, { Authorization: `Bearer ${TOKEN}` });

  const named = await asked(() => json(200, WHOLE_WEBHOOK), () => setWebhook(BASE, TOKEN, 'https://example.com/h', SIGNED));
  assert.deepEqual(named.result, WHOLE_WEBHOOK);
  assert.deepEqual([named.calls[0].method, named.calls[0].url], ['PUT', `${BASE}/inbox/webhook`]);
  assert.deepEqual(named.calls[0].headers, { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(named.calls[0].body), { url: 'https://example.com/h', confirmation: SIGNED });

  const removed = await asked(() => json(200, NO_WEBHOOK), () => deleteWebhook(BASE, TOKEN, SIGNED));
  assert.deepEqual(removed.result, NO_WEBHOOK);
  assert.deepEqual([removed.calls[0].method, removed.calls[0].url], ['DELETE', `${BASE}/inbox/webhook`]);
  assert.deepEqual(JSON.parse(removed.calls[0].body), { confirmation: SIGNED });
  assert.deepEqual(removed.calls[0].headers, { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
});

test('an answer about the webhook that is not whole is a refusal, whichever call asked', async () => {
  const { url: _url, ...noUrl } = WHOLE_WEBHOOK;
  const { set_here: _here, ...noHere } = WHOLE_WEBHOOK;
  const { set_at: _at, ...noAt } = WHOLE_WEBHOOK;
  const { set_by_key: _key, ...noKey } = WHOLE_WEBHOOK;
  const broken = [{}, null, [], noUrl, noHere, noAt, noKey, { ...WHOLE_WEBHOOK, url: 5 }, { ...WHOLE_WEBHOOK, set_here: 'yes' }, { ...WHOLE_WEBHOOK, set_at: '1790000000' }, { ...WHOLE_WEBHOOK, set_by_key: 7 }];
  const calls = [
    () => webhook(BASE, TOKEN),
    () => setWebhook(BASE, TOKEN, 'https://example.com/h'),
    () => deleteWebhook(BASE, TOKEN),
  ];
  for (const body of broken) {
    for (const call of calls) {
      const e = await refused(200, body, call);
      assert.equal(e.reason, 'unknown', JSON.stringify(body));
    }
  }
});

test('the devices are a list, and an answer without one is a refusal', async () => {
  const device = { id: 'd', device_pubkey: 'p256:abc', signer_pubkey: 'ed25519:abc', created_at: 1, valid_until: 2, this: true };
  const { calls, result } = await asked(() => json(200, { devices: [device] }), () => listDevices(BASE, TOKEN));
  assert.deepEqual(result, [device]);
  assert.deepEqual([calls[0].method, calls[0].url], ['GET', `${BASE}/inbox/devices`]);
  assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${TOKEN}` });
  assert.deepEqual((await asked(() => json(200, { devices: [] }), () => listDevices(BASE, TOKEN))).result, []);
  for (const body of [{}, { devices: null }, { devices: {} }, { devices: 'none' }, { device: [] }, []]) {
    const e = await refused(200, body, () => listDevices(BASE, TOKEN));
    assert.equal(e.reason, 'unknown', JSON.stringify(body));
  }
});

test('a mute names its subject and says whether what waits is deleted', async () => {
  for (const [who, deleteWaiting] of [
    [{ subject_is: 'agent', subject: 'agent.near' }, true],
    [{ subject_is: 'project', subject: 'p0000000000000a1f' }, false],
  ]) {
    const { calls, result } = await asked(() => json(200, { deleted: 2 }), () => mute(BASE, TOKEN, who, deleteWaiting));
    assert.deepEqual(result, { deleted: 2 });
    assert.deepEqual([calls[0].method, calls[0].url], ['POST', `${BASE}/inbox/mutes`]);
    assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(calls[0].body), { ...who, delete_waiting: deleteWaiting });
  }
});

test('an unmute names its subject and nothing else', async () => {
  const who = { subject_is: 'project', subject: 'p0000000000000a1f' };
  const { calls, result } = await asked(() => json(200, { mutes: [] }), () => unmute(BASE, TOKEN, who));
  assert.deepEqual(result, { mutes: [] });
  assert.deepEqual([calls[0].method, calls[0].url], ['DELETE', `${BASE}/inbox/mutes`]);
  assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(calls[0].body), who);
});

test('the mutes are read with the bearer', async () => {
  const mutes = [{ subject_is: 'agent', subject: 'agent.near' }];
  const { calls, result } = await asked(() => json(200, { mutes }), () => listMutes(BASE, TOKEN));
  assert.deepEqual(result, { mutes });
  assert.deepEqual([calls[0].method, calls[0].url, calls[0].body], ['GET', `${BASE}/inbox/mutes`, undefined]);
  assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${TOKEN}` });
});

// One task

const ODD_ID = 'run/../0?show=closed#x y%';
const ODD_PATH = 'run%2F..%2F0%3Fshow%3Dclosed%23x%20y%25';

test('a task\'s id is one segment of every path it is in', async () => {
  const file = await asked(() => json(200, { ciphertext: 'AQID' }), () => taskFile(BASE, TOKEN, ODD_ID, 2));
  assert.equal(file.result, 'AQID');
  assert.deepEqual([file.calls[0].method, file.calls[0].url], ['GET', `${BASE}/inbox/tasks/${ODD_PATH}/files/2`]);
  assert.deepEqual(file.calls[0].headers, { Authorization: `Bearer ${TOKEN}` });

  const made = { run: 'c', door: 'https', call_id: 'c', output: null };
  const origin = await asked(() => json(200, made), () => taskOrigin(BASE, TOKEN, ODD_ID));
  assert.deepEqual(origin.result, made);
  assert.deepEqual([origin.calls[0].method, origin.calls[0].url], ['GET', `${BASE}/inbox/tasks/${ODD_PATH}/origin`]);
  assert.deepEqual(origin.calls[0].headers, { Authorization: `Bearer ${TOKEN}` });

  const rejected = await asked(() => json(200, { id: ODD_ID, state: 'rejected' }), () => rejectTask(BASE, TOKEN, ODD_ID, 'c2VhbGVk'));
  assert.deepEqual([rejected.calls[0].method, rejected.calls[0].url], ['POST', `${BASE}/inbox/tasks/${ODD_PATH}/reject`]);
  assert.deepEqual(JSON.parse(rejected.calls[0].body), { reason: 'c2VhbGVk' });

  const deleted = await asked(() => json(200, { deleted: 1 }), () => deleteTask(BASE, TOKEN, ODD_ID));
  assert.deepEqual([deleted.calls[0].method, deleted.calls[0].url, deleted.calls[0].body], ['DELETE', `${BASE}/inbox/tasks/${ODD_PATH}`, undefined]);

  const plain = await asked(() => json(200, { ciphertext: 'AQID' }), () => taskFile(BASE, TOKEN, '0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0', 0));
  assert.equal(plain.calls[0].url, `${BASE}/inbox/tasks/0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0/files/0`);
});

test('an approval carries the hash read, the signature and what was said sealed, and is answered with the run or the failure', async () => {
  const approval = { at: 1793275200, public_key: 'ed25519:k', signature: 'c2ln', nonce: 'bm9uY2U=' };
  const started = await asked(
    () => json(200, { id: ODD_ID, state: 'approved', run: 'call-1' }),
    () => approveTask(BASE, TOKEN, ODD_ID, { task_hash: 'ab'.repeat(32), approval, supplied: 'c2VhbGVk', note: 'bm90ZQ==' }),
  );
  assert.deepEqual(started.result, { id: ODD_ID, state: 'approved', run: 'call-1' });
  assert.deepEqual([started.calls[0].method, started.calls[0].url], ['POST', `${BASE}/inbox/tasks/${ODD_PATH}/approve`]);
  assert.deepEqual(started.calls[0].headers, { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(started.calls[0].body), { task_hash: 'ab'.repeat(32), approval, supplied: 'c2VhbGVk', note: 'bm90ZQ==' });
  // Nothing said: neither member is sent, rather than sent as null.
  const bare = await asked(() => json(200, { id: 'run-0', state: 'approved', run: 'call-2' }), () => approveTask(BASE, TOKEN, 'run-0', { task_hash: 'ab'.repeat(32), approval }));
  assert.deepEqual(Object.keys(JSON.parse(bare.calls[0].body)).sort(), ['approval', 'task_hash']);
  // A run that could not be started is a failed task, not a refusal of the request.
  const failed = await asked(
    () => json(200, { id: 'run-0', state: 'failed', run: 'call-3', failure_reason: 'preparer_key_unavailable' }),
    () => approveTask(BASE, TOKEN, 'run-0', { task_hash: 'ab'.repeat(32), approval }),
  );
  assert.deepEqual(failed.result, { id: 'run-0', state: 'failed', run: 'call-3', failure_reason: 'preparer_key_unavailable' });
  const closed = await refused(409, { error: 'task_closed', message: 'the task is approved', state: 'approved' }, () => approveTask(BASE, TOKEN, 'run-0', { task_hash: 'ab'.repeat(32), approval }));
  assert.equal(closed.reason, 'task_closed');
});

test('a rejection without a reason says so, and sends no words', async () => {
  const { calls } = await asked(() => json(200, { id: 'run-0', state: 'rejected' }), () => rejectTask(BASE, TOKEN, 'run-0', null));
  assert.deepEqual(JSON.parse(calls[0].body), { reason: null });
});

test('a file answered without its bytes is a refusal', async () => {
  for (const body of [{}, { ciphertext: null }, { ciphertext: 7 }, { ciphertext: ['AQID'] }, { bytes: 'AQID' }]) {
    const e = await refused(200, body, () => taskFile(BASE, TOKEN, 'run-0', 0));
    assert.equal(e.reason, 'unknown', JSON.stringify(body));
  }
});

// Approvals and attestations

test('the approvals of a wallet are asked inside the session, and an answer without a list is a refusal', async () => {
  const pending = [{ id: 7, request_type: 'transfer' }];
  const { calls, result } = await asked(() => json(200, { pending_approvals: pending }), () =>
    pendingApprovals(BASE, TOKEN, 'ed25519:a+b/c&x=1'));
  assert.deepEqual(result, pending);
  assert.equal(calls[0].url, `${BASE}/wallet/v1/pending_approvals_by_pubkey?near_pubkey=ed25519%3Aa%2Bb%2Fc%26x%3D1`);
  assert.equal(calls[0].method, 'GET');
  assert.deepEqual(calls[0].headers, { Authorization: `Bearer ${TOKEN}` });
  for (const body of [{}, { pending_approvals: null }, { pending_approvals: {} }, { approvals: [] }]) {
    const e = await refused(200, body, () => pendingApprovals(BASE, TOKEN, 'ed25519:abc'));
    assert.equal(e.reason, 'unknown', JSON.stringify(body));
  }
});

test('an attestation is asked by the door of its run, without the bearer', async () => {
  const attestation = { task_id: 7, output_hash: 'ab'.repeat(32) };
  const https = await asked(() => json(200, attestation), () => attestationOf(BASE, { door: 'https', call_id: 'c-1', request_id: 9 }));
  assert.deepEqual(https.result, attestation);
  assert.equal(https.calls[0].url, `${BASE}/attestations/by-call/c-1`);
  assert.deepEqual(https.calls[0].headers, {});
  const chain = await asked(() => json(200, attestation), () => attestationOf(BASE, { door: 'chain', call_id: 'c-1', request_id: 9 }));
  assert.equal(chain.calls[0].url, `${BASE}/attestations/by-request/9`);
  assert.deepEqual(chain.calls[0].headers, {});
});

test('a run without an attestation is null, and a refusal to say is a refusal', async () => {
  const none = await asked(() => json(404, { error: 'Not found.', reason: 'not_found' }), () =>
    attestationOf(BASE, { door: 'https', call_id: 'c-1' }));
  assert.equal(none.result, null);
  const e = await refused(503, { error: 'Try again shortly.', reason: 'upstream_unavailable' }, () =>
    attestationOf(BASE, { door: 'https', call_id: 'c-1' }));
  assert.equal(e.terminal, false);
});

test('fetch is the platform\'s own again after every call', () => {
  assert.equal(typeof globalThis.fetch, 'function');
  assert.equal(globalThis.fetch.name, 'fetch');
});

test('an answer of 200 that is not JSON is a refusal in the page\'s own words', async () => {
  const kept = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html>gateway</html>', { status: 200 });
  try {
    const { listTasks, InboxRefused } = await import('../lib/inbox/api.ts');
    await assert.rejects(listTasks('https://api.example', 'os_x'), (e) => {
      assert.ok(e instanceof InboxRefused);
      assert.equal(e.reason, 'unknown');
      assert.equal(e.message, 'The answer could not be read.');
      return true;
    });
  } finally {
    globalThis.fetch = kept;
  }
});

test('a list that holds what is no task is a refusal, and a refusal with a sentence alone says it', async () => {
  const { readListed, InboxRefused } = await import('../lib/inbox/api.ts');
  for (const rows of [[null], ['run-0'], [{}], [{ id: 7 }], [{ id: 'run-0', state: 'open' }, null]]) {
    assert.throws(() => readListed({ tasks: rows, more: false }), InboxRefused, JSON.stringify(rows));
  }
  const kept = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'The wallet is frozen.' }), { status: 403 });
  try {
    const { listMutes } = await import('../lib/inbox/api.ts');
    await assert.rejects(listMutes('https://api.example', 'os_x'), (e) => {
      assert.equal(e.reason, 'unknown');
      assert.equal(e.message, 'The wallet is frozen.');
      return true;
    });
  } finally {
    globalThis.fetch = kept;
  }
});
