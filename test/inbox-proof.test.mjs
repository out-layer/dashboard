import assert from 'node:assert/strict';
import test from 'node:test';
import { ONCE_READABLE, namesTask, prove, verdict } from '../lib/inbox/proof.ts';

const ID = '0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11-0';
const CALL = '0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11';
const HASH = 'ab'.repeat(32);
const WASM = 'cd'.repeat(32);
const TASK = { id: ID, project_id: 'connectors.outlayer.near/gmail', preparer: 'agent.near', owner: 'owner.near', build: WASM, thread: ID };
/** The same task as the next turn of a conversation the agent started. */
const TURN_TASK = { ...TASK, thread: 'req-3-0' };
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
      origin: async () => ({ run: CALL, door: 'https', call_id: CALL, input: null, output: OUTPUT, ...over.origin }),
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

test("a turn's run, made by the owner, is the run of the task the agent prepared; a third account's is not", async () => {
  const TURN = "The attested run is the run that made this task: your own answer to the conversation's previous task.";
  const https = await world({ attestation: { payment_key_owner: 'owner.near' } });
  const byOwner = await prove(TURN_TASK, HASH, https.deps);
  assert.equal(byOwner.holds, true);
  assert.deepEqual(byOwner.steps[2], { name: 'run', ok: true, said: TURN });

  const named = JSON.stringify({ output: { task_id: ID, task_hash: HASH } });
  const chain = {
    origin: { door: 'chain', run: 'req-7', call_id: undefined, request_id: 7, output: named },
    attestation: { call_id: undefined, payment_key_owner: undefined, request_id: 7, output_hash: await sha256(named) },
  };
  const onChain = await world({ ...chain, attestation: { ...chain.attestation, caller_account_id: 'owner.near' } });
  const onChainByOwner = await prove(TURN_TASK, HASH, onChain.deps);
  assert.equal(onChainByOwner.holds, true);
  assert.equal(onChainByOwner.steps[2].said, TURN);

  const third = await world({ attestation: { payment_key_owner: 'mallory.near' } });
  const byThird = await prove(TURN_TASK, HASH, third.deps);
  assert.deepEqual(failed(byThird), ['run']);
  assert.equal(byThird.steps[2].said, `The attested run is not the run ${CALL} made by agent.near or by you.`);
  const thirdOnChain = await world({ ...chain, attestation: { ...chain.attestation, caller_account_id: 'mallory.near' } });
  assert.deepEqual(failed(await prove(TASK, HASH, thirdOnChain.deps)), ['run']);
  // The preparer's own run still says so.
  assert.equal((await prove(TASK, HASH, (await world()).deps)).steps[2].said, `It was a run of ${TASK.project_id}, made by agent.near.`);
  assert.equal((await prove(TURN_TASK, HASH, (await world()).deps)).holds, true, "a turn made by the agent's own run");
});

test("the owner's run makes a turn only: a task that starts its conversation, made by the owner's run, does not hold", async () => {
  const https = await world({ attestation: { payment_key_owner: 'owner.near' } });
  const started = await prove(TASK, HASH, https.deps);
  assert.equal(TASK.thread, TASK.id);
  assert.equal(started.holds, false);
  assert.deepEqual(failed(started), ['run']);
  assert.equal(started.steps[2].said, 'The attested run is your own, and this task starts its conversation: only a run of agent.near makes such a task.');
  assert.match(verdict(started), /^The proof does not hold\. The attested run is your own/);

  // A locked card: the conversation is not known, so the owner's run is not taken as a turn's.
  const locked = await prove({ ...TASK, thread: null, build: null }, null, https.deps);
  assert.equal(locked.holds, false);
  assert.equal(locked.unchecked, true);
  assert.deepEqual(unread(locked), ['run', 'task']);
  assert.match(locked.steps[2].said, /checked once the task is readable in this browser\.$/);
  // The preparer's run on a locked card is held as before.
  const lockedByAgent = await prove({ ...TASK, thread: null, build: null }, null, (await world()).deps);
  assert.deepEqual(unread(lockedByAgent), ['task']);
});

test('a proof with nothing in it is not a proof', () => {
  assert.equal(verdict({ holds: false, unchecked: true, steps: [], attestation: null, input: null, output: null }), 'The proof could not be checked.');
});

test('a task not readable in this browser is proven up to its hash, which waits', async () => {
  // Nothing opened here: no build and no hash. The run, its enclave, its
  // build and its answer are held; whether the answer names THIS task waits.
  const { deps, asked } = await world();
  const proof = await prove({ ...TASK, build: null }, null, deps);
  assert.equal(proof.holds, false);
  assert.equal(proof.unchecked, true);
  assert.deepEqual(proof.steps.map((s) => [s.name, s.ok]), [
    ['attestation', true], ['enclave', true], ['run', true], ['build', true], ['answer', true], ['task', null],
  ]);
  assert.equal(proof.steps.at(-1).said, ONCE_READABLE);
  assert.deepEqual(asked, [[TASK.project_id, WASM]], 'the contract is still asked about the build');
  assert.equal(proof.attestation.output_hash, await sha256(OUTPUT));
  assert.equal(proof.output, OUTPUT);
  assert.match(verdict(proof), /^Made by a published build of the project, in an approved enclave\. Whether it is this task is checked once the task is readable in this browser\.$/);

  // What is wrong before the hash still fails, hash or no hash.
  const other = await prove({ ...TASK, build: null }, null, (await world({ published: false })).deps);
  assert.deepEqual(failed(other), ['build']);
  assert.match(verdict(other), /^The proof does not hold\./);
  const unanswered = await prove({ ...TASK, build: null }, null, (await world({ origin: { output: null } })).deps);
  assert.deepEqual(unanswered.steps.map((s) => s.name), ['attestation', 'enclave', 'run', 'build', 'answer']);
  assert.deepEqual(failed(unanswered), ['answer']);
  // A step that could not be run beside the waiting hash is what the verdict says.
  const down = await prove({ ...TASK, build: null }, null, (await world({ deps: { published: async () => { throw new Error('rpc'); } } })).deps);
  assert.deepEqual(unread(down), ['build', 'task']);
  assert.match(verdict(down), /^The proof could not be checked\. The contract could not be asked/);
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

test('what the run was asked is held to the attested input hash, and carried', async () => {
  const INPUT = JSON.stringify({ operation: 'send', to: 'bob@example.com' });
  const asked = await world({ origin: { input: INPUT }, attestation: { input_hash: await sha256(INPUT) } });
  const proof = await prove(TASK, HASH, asked.deps);
  assert.equal(proof.holds, true);
  assert.deepEqual(proof.steps.map((s) => [s.name, s.ok]), [
    ['attestation', true], ['enclave', true], ['run', true], ['build', true], ['input', true], ['answer', true], ['task', true],
  ]);
  assert.equal(proof.steps[4].said, "The run's input hashes to the attested input_hash.");
  assert.equal(proof.input, INPUT, 'what the run was asked is carried');
  assert.equal(proof.output, OUTPUT);
  assert.equal(verdict(proof), 'Made by a published build of the project, in an approved enclave.');

  const other = await world({ origin: { input: INPUT }, attestation: { input_hash: '00'.repeat(32) } });
  const wrong = await prove(TASK, HASH, other.deps);
  assert.equal(wrong.holds, false);
  assert.deepEqual(failed(wrong), ['input']);
  assert.equal(wrong.steps[4].said, "The run's input does not hash to the attested input_hash.");
  assert.equal(wrong.input, INPUT, 'carried all the same');
  assert.match(verdict(wrong), /^The proof does not hold\. The run's input does not hash/);

  const unnamed = await world({ origin: { input: INPUT }, attestation: { input_hash: undefined } });
  const nameless = await prove(TASK, HASH, unnamed.deps);
  assert.deepEqual(failed(nameless), ['input']);
  assert.match(nameless.steps[4].said, /does not name the hash of what the run was asked/);

  // The input is carried even where the proof stops short of its step.
  const none = await world({ none: true, origin: { input: INPUT } });
  const without = await prove(TASK, HASH, none.deps);
  assert.deepEqual(without.steps.map((s) => s.name), ['attestation']);
  assert.equal(without.input, INPUT);
  const down = await world({ deps: { origin: async () => { throw new Error('the API did not answer'); } } });
  assert.equal((await prove(TASK, HASH, down.deps)).input, null);
});

test('a run asked on chain has no input step: its input is in the transaction', async () => {
  const chain = {
    origin: { door: 'chain', run: 'req-7', call_id: undefined, request_id: 7, input: null, output: OUTPUT },
    attestation: { call_id: undefined, payment_key_owner: undefined, request_id: 7, caller_account_id: 'agent.near', input_hash: 'ab'.repeat(32) },
  };
  const { deps } = await world(chain);
  const proof = await prove(TASK, HASH, deps);
  assert.deepEqual(proof.steps.map((s) => s.name), ['attestation', 'enclave', 'run', 'build', 'answer', 'task']);
  assert.equal(proof.input, null);
  assert.equal(proof.holds, true);
  // An origin without the field at all is read the same way.
  const older = await world({ origin: { input: undefined } });
  const read = await prove(TASK, HASH, older.deps);
  assert.ok(!read.steps.some((s) => s.name === 'input'));
  assert.equal(read.input, null);
  assert.equal(read.holds, true);
});

test('with the input step the task that waits is still the one step that waits', async () => {
  const INPUT = '{"x":1}';
  const { deps } = await world({ origin: { input: INPUT }, attestation: { input_hash: await sha256(INPUT) } });
  const proof = await prove({ ...TASK, build: null }, null, deps);
  assert.equal(proof.steps.length, 7);
  assert.deepEqual(unread(proof), ['task']);
  assert.match(verdict(proof), /Whether it is this task is checked once the task is readable in this browser\.$/);
  assert.equal(proof.input, INPUT);
});
