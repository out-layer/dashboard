import assert from 'node:assert/strict';
import test from 'node:test';
import { namesTask, prove, verdict } from '../lib/inbox/proof.ts';

const ID = '0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0';
const CALL = '0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11';
const HASH = 'ab'.repeat(32);
const WASM = 'cd'.repeat(32);
const TASK = { id: ID, project_id: 'connectors.outlayer.near/gmail', preparer: 'agent.near', build: WASM };
const OUTPUT = JSON.stringify({
  success: true,
  output: { status: 'awaiting_owner', task_id: ID, task_hash: HASH, link: 'https://app.outlayer.ai/inbox/x' },
  logs: [],
});
const sha256 = async (text) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

async function world(over = {}) {
  const attestation = {
    task_id: 7,
    output_hash: await sha256(OUTPUT),
    project_id: TASK.project_id,
    executed_wasm_sha256: WASM,
    call_id: CALL,
    payment_key_owner: 'agent.near',
    ...over.attestation,
  };
  const asked = [];
  return {
    asked,
    deps: {
      origin: async () => ({ run: CALL, door: 'https', call_id: CALL, output: OUTPUT, ...over.origin }),
      attestation: async () => ('none' in over ? null : attestation),
      verify: async () => ({
        authenticity: { ok: true, status: 'UpToDate' },
        identity: { ok: true, checked: true },
        binding: { ok: true, checked: true },
        ...over.verified,
      }),
      published: async (project, wasm) => {
        asked.push([project, wasm]);
        return over.published ?? true;
      },
      chainOutput: async () => over.chainOutput ?? null,
      sha256,
      ...over.deps,
    },
  };
}

const failed = (proof) => proof.steps.filter((s) => s.ok === false).map((s) => s.name);
const unread = (proof) => proof.steps.filter((s) => s.ok === null).map((s) => s.name);

test('an answer names a task wherever it has room for it', () => {
  assert.ok(namesTask(OUTPUT, ID, HASH));
  assert.ok(namesTask(OUTPUT, ID, HASH.toUpperCase()));
  assert.ok(namesTask(JSON.stringify({ output: { result: 1, next: { task_id: ID, task_hash: HASH } } }), ID, HASH), 'a turn');
  assert.ok(namesTask(JSON.stringify([{ a: [{ task_id: ID, task_hash: HASH }] }]), ID, HASH));
  assert.ok(namesTask(JSON.stringify(OUTPUT), ID, HASH), 'an answer stored as a string of JSON');
});

test('an answer that names another task, another hash, or nothing, names nothing', () => {
  assert.ok(!namesTask(OUTPUT, ID, 'ef'.repeat(32)));
  assert.ok(!namesTask(OUTPUT, `${CALL}-1`, HASH));
  // The id in one place and the hash in another are not a task named.
  assert.ok(!namesTask(JSON.stringify({ a: { task_id: ID }, b: { task_hash: HASH } }), ID, HASH));
  assert.ok(!namesTask(JSON.stringify({ text: `task_id ${ID} task_hash ${HASH}` }), ID, HASH));
  assert.ok(!namesTask(JSON.stringify({ task_id: ID, task_hash: 7 }), ID, HASH));
  for (const none of ['', 'not json', 'null', '7', '"text"', '{}', '[]']) assert.ok(!namesTask(none, ID, HASH), none);
  let deep = { task_id: ID, task_hash: HASH };
  for (let i = 0; i < 40; i += 1) deep = { in: deep };
  assert.ok(!namesTask(JSON.stringify(deep), ID, HASH), 'not searched without end');
});

test('the proof holds when every step does', async () => {
  const { deps, asked } = await world();
  const proof = await prove(TASK, HASH, deps);
  assert.equal(proof.holds, true);
  assert.equal(proof.unchecked, false);
  assert.deepEqual(proof.steps.map((s) => [s.name, s.ok]), [
    ['attestation', true], ['enclave', true], ['run', true], ['build', true], ['answer', true], ['task', true],
  ]);
  assert.deepEqual(asked, [[TASK.project_id, WASM]]);
  assert.equal(verdict(proof), 'Made by a published build of the project, in an approved enclave.');
});

test('a task shown with another hash than the run made is not proven', async () => {
  const { deps } = await world();
  const proof = await prove(TASK, 'ef'.repeat(32), deps);
  assert.equal(proof.holds, false);
  assert.deepEqual(failed(proof), ['task']);
  assert.match(verdict(proof), /does not hold.*does not name this task/);
});

test('each thing that is wrong fails its own step', async () => {
  const cases = [
    [{ none: true }, ['attestation']],
    [{ verified: { authenticity: { ok: false, error: 'quote signature is invalid' } } }, ['enclave']],
    [{ verified: { identity: { ok: false, checked: true } } }, ['enclave']],
    [{ verified: { binding: { ok: false, checked: true } } }, ['enclave']],
    [{ attestation: { project_id: 'mallory.near/app' } }, ['run']],
    [{ attestation: { call_id: '11111111-1111-4111-8111-111111111111' } }, ['run']],
    [{ attestation: { payment_key_owner: 'other.near' } }, ['run']],
    [{ published: false }, ['build']],
    [{ attestation: { executed_wasm_sha256: undefined } }, ['build']],
    [{ attestation: { output_hash: '00'.repeat(32) } }, ['answer']],
    [{ origin: { output: null } }, ['answer']],
    [{ origin: { output: JSON.stringify({ success: true }) }, attestation: { output_hash: await sha256(JSON.stringify({ success: true })) } }, ['task']],
  ];
  for (const [over, expected] of cases) {
    const { deps } = await world(over);
    const proof = await prove(TASK, HASH, deps);
    assert.equal(proof.holds, false, JSON.stringify(over));
    assert.deepEqual(failed(proof), expected, JSON.stringify(over));
  }
});

test('what could not be asked is not checked, which is not a failure and not a proof', async () => {
  const down = async () => {
    throw new Error('the network did not answer');
  };
  for (const [over, expected] of [
    [{ deps: { origin: down } }, ['attestation']],
    [{ deps: { attestation: down } }, ['attestation']],
    [{ deps: { verify: down } }, ['enclave']],
    [{ verified: { authenticity: { ok: false, error: 'verifier failed to load: fetch' } } }, ['enclave']],
    [{ verified: { identity: { ok: false, checked: false, error: 'rpc' } } }, ['enclave']],
    [{ deps: { published: down } }, ['build']],
  ]) {
    const { deps } = await world(over);
    const proof = await prove(TASK, HASH, deps);
    assert.equal(proof.holds, false, JSON.stringify(expected));
    assert.equal(proof.unchecked, true, JSON.stringify(expected));
    assert.deepEqual(unread(proof), expected);
    assert.deepEqual(failed(proof), []);
    assert.match(verdict(proof), /could not be checked/);
  }
});

test('a run on chain is read off its transaction', async () => {
  const chain = {
    origin: { door: 'chain', run: 'req-7', call_id: undefined, request_id: 7, output: null },
    attestation: { call_id: undefined, payment_key_owner: undefined, request_id: 7, caller_account_id: 'agent.near' },
    chainOutput: OUTPUT,
  };
  const { deps } = await world(chain);
  assert.equal((await prove({ ...TASK, id: 'req-7-0' }, HASH, deps)).steps.at(-1).ok, false, 'another id than the answer names');
  const named = JSON.stringify({ output: { task_id: 'req-7-0', task_hash: HASH } });
  const holds = await world({ ...chain, chainOutput: named, attestation: { ...chain.attestation, output_hash: await sha256(named) } });
  assert.equal((await prove({ ...TASK, id: 'req-7-0' }, HASH, holds.deps)).holds, true);
  const another = await world({ ...chain, chainOutput: named, attestation: { ...chain.attestation, request_id: 8, output_hash: await sha256(named) } });
  assert.deepEqual(failed(await prove({ ...TASK, id: 'req-7-0' }, HASH, another.deps)), ['run']);
});

test('a proof stops where nothing more can be held, and says what it read', async () => {
  const none = await world({ none: true });
  const without = await prove(TASK, HASH, none.deps);
  assert.deepEqual(without.steps.map((s) => s.name), ['attestation']);
  assert.equal(without.attestation, null);
  assert.equal(without.output, OUTPUT, 'what the run answered was read');
  assert.equal(without.unchecked, false);
  assert.deepEqual(none.asked, [], 'the contract is not asked about a build nobody attests');
  assert.match(verdict(without), /^The proof does not hold\. The run .* has no attestation\.$/);

  const down = await world({ deps: { origin: async () => { throw new Error('the API did not answer'); } } });
  const unasked = await prove(TASK, HASH, down.deps);
  assert.deepEqual(unasked.steps.map((s) => [s.name, s.ok]), [['attestation', null]]);
  assert.equal(unasked.attestation, null);
  assert.equal(unasked.output, null);
  assert.equal(verdict(unasked), "The proof could not be checked. The run's attestation could not be read: the API did not answer");
});

test('what is thrown and is no error is still said', async () => {
  const { deps } = await world({ deps: { verify: async () => { throw 'the verifier is gone'; } } });
  const proof = await prove(TASK, HASH, deps);
  assert.deepEqual(unread(proof), ['enclave']);
  assert.match(proof.steps[1].said, /the verifier is gone/);
});

test('a quote that failed is a failure, and one that could not be read is not', async () => {
  for (const [error, ok] of [
    [undefined, false],
    ['', false],
    ['TCB status is Revoked', false],
    ['quote signature is invalid', false],
    ['collateral signature mismatch', false],
    ['report data mismatch after fetch', false],
    ['failed to load the verifier', null],
    ['the collateral is not there', null],
    ['network error', null],
    ['could not reach Intel', null],
  ]) {
    const { deps } = await world({ verified: { authenticity: { ok: false, error } } });
    const proof = await prove(TASK, HASH, deps);
    assert.equal(proof.steps[1].name, 'enclave');
    assert.equal(proof.steps[1].ok, ok, String(error));
    assert.equal(proof.holds, false);
    assert.equal(proof.steps.length, 6, 'the other steps are still run');
  }
  const silent = await world({ verified: { authenticity: { ok: false } } });
  assert.equal((await prove(TASK, HASH, silent.deps)).steps[1].said, "The enclave's quote: the quote did not verify.");
});

test('a quote whose commitment could not be checked is not checked', async () => {
  const { deps } = await world({ verified: { binding: { ok: false, checked: false } } });
  const proof = await prove(TASK, HASH, deps);
  assert.deepEqual(unread(proof), ['enclave']);
  assert.deepEqual(failed(proof), []);
  assert.match(proof.steps[1].said, /the contract did not answer/);
  // Not checked comes before does not hold: nothing is called a failure that was not read.
  const both = await world({ verified: { identity: { ok: false, checked: false, error: 'rpc' }, binding: { ok: false, checked: true } } });
  assert.deepEqual(unread(await prove(TASK, HASH, both.deps)), ['enclave']);
});

test('the status Intel gave is said with an approved enclave', async () => {
  const stale = await world({ verified: { authenticity: { ok: true, status: 'OutOfDate' } } });
  assert.equal((await prove(TASK, HASH, stale.deps)).steps[1].said, "An approved enclave ran it (Intel's status: OutOfDate).");
  const unnamed = await world({ verified: { authenticity: { ok: true } } });
  assert.equal((await prove(TASK, HASH, unnamed.deps)).steps[1].said, "An approved enclave ran it (Intel's status: unknown).");
});

test('one step that fails beside one that was not checked is a proof that does not hold', async () => {
  const { deps } = await world({
    published: false,
    verified: { identity: { ok: false, checked: false, error: 'rpc' } },
  });
  const proof = await prove(TASK, HASH, deps);
  assert.deepEqual(unread(proof), ['enclave']);
  assert.deepEqual(failed(proof), ['build']);
  assert.equal(proof.holds, false);
  assert.equal(proof.unchecked, false);
  assert.match(verdict(proof), /^The proof does not hold\. The build that ran is not a version/);
});

test('an attestation that names nobody is held to the run by its id alone', async () => {
  const https = await world({ attestation: { payment_key_owner: undefined } });
  assert.equal((await prove(TASK, HASH, https.deps)).holds, true);
  // The door decides which id is read: the other one proves nothing.
  const wrongDoor = await world({ attestation: { call_id: undefined, request_id: 7 }, origin: { request_id: 7 } });
  assert.deepEqual(failed(await prove(TASK, HASH, wrongDoor.deps)), ['run']);
  const unnamed = await world({ attestation: { project_id: undefined } });
  const proof = await prove(TASK, HASH, unnamed.deps);
  assert.deepEqual(failed(proof), ['run']);
  assert.match(proof.steps[2].said, /was of no project/);
});

test('the contract is asked about the task\'s project, whatever the attestation names', async () => {
  const { deps, asked } = await world({ attestation: { project_id: 'mallory.near/app' } });
  await prove(TASK, HASH, deps);
  assert.deepEqual(asked, [[TASK.project_id, WASM]]);
});

test('a run over HTTPS whose answer is not kept is not read off the chain', async () => {
  let read = 0;
  const { deps } = await world({
    origin: { output: null },
    deps: { chainOutput: async () => { read += 1; return OUTPUT; } },
  });
  const proof = await prove(TASK, HASH, deps);
  assert.equal(read, 0);
  assert.deepEqual(failed(proof), ['answer']);
  assert.deepEqual(proof.steps.map((s) => s.name), ['attestation', 'enclave', 'run', 'build', 'answer']);
  assert.equal(proof.output, null);
  assert.notEqual(proof.attestation, null);
});

test('a run on chain whose transaction cannot be read is not checked, and one that answered nothing does not hold', async () => {
  const chain = {
    origin: { door: 'chain', run: 'req-7', call_id: undefined, request_id: 7, output: null },
    attestation: { call_id: undefined, payment_key_owner: undefined, request_id: 7, caller_account_id: 'agent.near' },
  };
  const down = await world({ ...chain, deps: { chainOutput: async () => { throw new Error('the RPC did not answer'); } } });
  const unasked = await prove(TASK, HASH, down.deps);
  assert.deepEqual(unread(unasked), ['answer']);
  assert.deepEqual(failed(unasked), []);
  assert.equal(unasked.unchecked, true);
  assert.equal(unasked.steps.length, 5);
  assert.match(verdict(unasked), /could not be checked.*the RPC did not answer/);

  const empty = await world(chain);
  const nothing = await prove(TASK, HASH, empty.deps);
  assert.deepEqual(failed(nothing), ['answer']);
  assert.equal(nothing.steps.length, 5);

  // An answer the inbox kept is the one held to the attestation: the chain is not asked.
  let read = 0;
  const kept = await world({ ...chain, origin: { ...chain.origin, output: OUTPUT }, deps: { chainOutput: async () => { read += 1; return null; } } });
  const proof = await prove(TASK, HASH, kept.deps);
  assert.equal(read, 0);
  assert.equal(proof.steps.find((s) => s.name === 'answer').ok, true);
  assert.equal(proof.output, OUTPUT);
});

test('a run on chain made by another account is not the run of the task', async () => {
  const named = JSON.stringify({ output: { task_id: ID, task_hash: HASH } });
  const chain = {
    origin: { door: 'chain', run: 'req-7', call_id: undefined, request_id: 7, output: named },
    attestation: { call_id: undefined, payment_key_owner: undefined, request_id: 7, output_hash: await sha256(named) },
  };
  const other = await world({ ...chain, attestation: { ...chain.attestation, caller_account_id: 'other.near' } });
  assert.deepEqual(failed(await prove(TASK, HASH, other.deps)), ['run']);
  const unnamed = await world(chain);
  assert.equal((await prove(TASK, HASH, unnamed.deps)).holds, true);
});

test('a proof with nothing in it is not a proof', () => {
  assert.equal(verdict({ holds: false, unchecked: true, steps: [], attestation: null, output: null }), 'The proof could not be checked.');
});

test('a task names the build that made it, and an attestation of another build is not its proof', async () => {
  const other = await prove({ ...TASK, build: 'ef'.repeat(32) }, HASH, (await world()).deps);
  const build = other.steps.find((s) => s.name === 'build');
  assert.equal(build.ok, false);
  assert.match(build.said, /not the build/);
  assert.equal(other.holds, false);
  // Not open on this device yet: the build is not held, the rest is.
  const unread = await prove({ ...TASK, build: null }, HASH, (await world()).deps);
  assert.equal(unread.steps.find((s) => s.name === 'build').ok, true);
});
