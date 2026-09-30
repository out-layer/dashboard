// The page's side of a task against the host's. The vectors in
// `inbox-golden.json` were made by the worker's host
// (`worker/src/tasks/crypto.rs`, `print_fresh_golden_vectors`, in the main
// repo) and are pinned there as well: change one side and the other must move.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  fromBase64, fromBase64Url, isEnvelope, newDevice, openContent, openFile, openFrom, readPubkey, readTask, replyBytes,
  saveName, sealTo, statement, toBase64, toBase64Url, toHex, writePubkey, writeReply,
} from '../lib/inbox/crypto.ts';

const GOLDEN = JSON.parse(readFileSync(new URL('./inbox-golden.json', import.meta.url), 'utf8'));
const subtle = globalThis.crypto.subtle;
const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));

// The device of the golden vectors: the scalar 01 02 … 20, imported so that
// it cannot be exported — as a device's key is.
const GOLDEN_DEVICE_PKCS8 =
  '308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420' +
  '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

async function goldenDevice() {
  const privateKey = await subtle.importKey(
    'pkcs8', fromHex(GOLDEN_DEVICE_PKCS8), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'],
  );
  return { privateKey, point: readPubkey(GOLDEN.device_pubkey), pubkey: GOLDEN.device_pubkey };
}

function envelope(over = {}) {
  return {
    answer_by: { operation: 'confirm', supplies: 'nothing' },
    created_at: 1790000000,
    display: {
      title: 'Send an email',
      fields: [{ kind: 'address', label: 'To', values: ['bob@example.com'], written_by: 'agent' }],
    },
    expires_at: 1790003600,
    files: [],
    id: 'run-0',
    kind: 'confirm',
    owner: 'owner.near',
    build: 'b'.repeat(64),
    policy_hash: 'a'.repeat(64),
    preparer: 'agent.near',
    profile: 'gmail',
    project: 'connectors.outlayer.near/gmail',
    project_uuid: 'p0000000000000001',
    reply_pubkey: GOLDEN.reply_pubkey,
    state_hash: 'b'.repeat(64),
    thread: 'run-0',
    v: 1,
    ...over,
  };
}

/** A task as the host makes it and the inbox lists it, for `device`. */
async function listed(device, document, id = 'run-0') {
  const contentKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const key = await subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: new TextEncoder().encode(id) }, key, document),
  );
  const content = new Uint8Array([0x01, ...nonce, ...sealed]);
  const copy = await sealTo(device.point, 'device-copy', id, contentKey);
  return {
    id,
    project_id: 'connectors.outlayer.near/gmail',
    preparer: 'agent.near',
    content: toBase64(content),
    device_copy: toBase64(copy),
  };
}

const bytes = (value) => new TextEncoder().encode(JSON.stringify(value));

test('a device key cannot be exported by the page', async () => {
  const device = await newDevice();
  assert.equal(device.privateKey.extractable, false);
  for (const format of ['pkcs8', 'jwk', 'raw']) {
    await assert.rejects(subtle.exportKey(format, device.privateKey));
  }
  assert.equal(writePubkey(device.point), device.pubkey);
  assert.deepEqual(readPubkey(device.pubkey), device.point);
});

test('the sentence is the one the host and the coordinator rebuild', () => {
  assert.equal(
    statement('alice.near', 'p256:abc', 1793275200),
    'Sign in to OutLayer as alice.near. Device key: p256:abc. Valid until 2026-10-29T12:00:00Z.',
  );
});

test('base64 in both alphabets reads what it writes', () => {
  const all = new Uint8Array(256).map((_, i) => i);
  assert.deepEqual(fromBase64(toBase64(all)), all);
  assert.deepEqual(fromBase64Url(toBase64Url(all)), all);
  assert.ok(!/[+/=]/.test(toBase64Url(all)));
});

test('what the host made for the device, the page opens', async () => {
  const device = await goldenDevice();
  const key = await openFrom(device, 'device-copy', GOLDEN.task, fromHex(GOLDEN.device_copy));
  assert.equal(toHex(key), GOLDEN.content_key);
  const document = await openContent(key, GOLDEN.task, fromHex(GOLDEN.content));
  assert.equal(new TextDecoder().decode(document), GOLDEN.document);
  assert.equal(toHex(new Uint8Array(await subtle.digest('SHA-256', document))), GOLDEN.hash);
});

test('a copy opens for its device, its purpose and its task, and for nothing else', async () => {
  const device = await goldenDevice();
  const copy = fromHex(GOLDEN.device_copy);
  const other = await newDevice();
  await assert.rejects(openFrom(other, 'device-copy', GOLDEN.task, copy), /decryption failed/);
  await assert.rejects(openFrom(device, 'answer', GOLDEN.task, copy), /decryption failed/);
  await assert.rejects(openFrom(device, 'device-copy', 'run-1', copy), /decryption failed/);
  await assert.rejects(openFrom(device, 'device-copy', GOLDEN.task, copy.slice(0, -1)), /decryption failed/);
  await assert.rejects(openFrom(device, 'device-copy', GOLDEN.task, new Uint8Array(0)), /decryption failed/);
  await assert.rejects(openContent(fromHex(GOLDEN.content_key), 'run-1', fromHex(GOLDEN.content)), /decryption failed/);
});

test('a task is read whole, and the hash is of the bytes that opened', async () => {
  const device = await newDevice();
  const document = bytes(envelope());
  const read = await readTask(device, await listed(device, document), 'owner.near');
  assert.equal(read.envelope.display.title, 'Send an email');
  assert.equal(read.hash, toHex(new Uint8Array(await subtle.digest('SHA-256', document))));
  // The document is held as it opened: its bytes, and no re-serialization, are what the hash is of.
  assert.equal(read.document, new TextDecoder().decode(document));
  assert.equal(toHex(new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(read.document)))), read.hash);
  const changed = await readTask(
    device,
    await listed(device, bytes(envelope({ display: { title: 'Send an email', fields: [{ kind: 'address', label: 'To', values: ['bob@example.con'], written_by: 'agent' }] } }))),
    'owner.near',
  );
  assert.notEqual(changed.hash, read.hash, 'one byte of what is shown is another hash');
});

test('a task that is not the one listed is not shown as it', async () => {
  const device = await newDevice();
  const task = await listed(device, bytes(envelope()));
  const mismatch = /not the task listed/;
  await assert.rejects(readTask(device, task, 'mallory.near'), mismatch, 'another owner');
  await assert.rejects(readTask(device, { ...task, project_id: 'mallory.near/app' }, 'owner.near'), mismatch);
  await assert.rejects(readTask(device, { ...task, preparer: 'other.near' }, 'owner.near'), mismatch);
  // The content and the copy of another task, put in this one's row.
  await assert.rejects(readTask(device, { ...task, id: 'run-1' }, 'owner.near'), /decryption failed/);
  const other = await listed(device, bytes(envelope({ id: 'run-1' })), 'run-0');
  await assert.rejects(readTask(device, other, 'owner.near'), mismatch, 'an envelope that names another id');
});

test('a task with no copy for this device is locked, and says so', async () => {
  const device = await newDevice();
  const task = await listed(device, bytes(envelope()));
  await assert.rejects(readTask(device, { ...task, device_copy: null }, 'owner.near'), /locked/);
  await assert.rejects(readTask(device, { ...task, content: null }, 'owner.near'), /locked/);
  await assert.rejects(readTask(await newDevice(), task, 'owner.near'), /decryption failed/);
});

test('what opens and is not an envelope is not drawn', async () => {
  const device = await newDevice();
  const refused = async (document) =>
    assert.rejects(readTask(device, await listed(device, document), 'owner.near'), /not a task/);
  await refused(new TextEncoder().encode('not json'));
  await refused(new Uint8Array([0xff, 0xfe]));
  await refused(bytes([]));
  await refused(bytes({ ...envelope(), v: 2 }));
  await refused(bytes({ ...envelope(), kind: 'approve' }));
  const { state_hash: _, ...missing } = envelope();
  await refused(bytes(missing));
  const field = (over) => bytes(envelope({ display: { title: 't', fields: [{ kind: 'text', label: 'l', values: ['v'], written_by: 'agent', ...over }] } }));
  await refused(field({ kind: 'html' }));
  await refused(field({ values: [{ href: 'https://evil.example' }] }));
  await refused(field({ values: 'one' }));
  await refused(field({ written_by: 'platform' }));
  assert.ok(isEnvelope(envelope()));
  assert.ok(!isEnvelope(null));
});

/** A file as the host stores it under `contentKey`, at `at` of `task`. */
async function storedFile(contentKey, task, at, bytes) {
  const key = await subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(`${task}:file:${at}`);
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, bytes));
  return new Uint8Array([0x01, ...nonce, ...sealed]);
}

test('a file opens as that file of that task, and only as the bytes the task names', async () => {
  const contentKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const bytes = new TextEncoder().encode('%PDF-1.7 the report');
  const note = {
    name: 'report.pdf',
    content_type: 'application/pdf',
    size: bytes.length,
    sha256: toHex(new Uint8Array(await subtle.digest('SHA-256', bytes))),
  };
  const blob = await storedFile(contentKey, 'run-0', 1, bytes);
  assert.deepEqual(await openFile(contentKey, 'run-0', 1, note, blob), bytes);

  await assert.rejects(openFile(contentKey, 'run-0', 0, note, blob), /decryption failed/, 'another place');
  await assert.rejects(openFile(contentKey, 'run-1', 1, note, blob), /decryption failed/, 'another task');
  await assert.rejects(openContent(contentKey, 'run-0', blob), /decryption failed/, 'a file is not the content');
  await assert.rejects(openFile(contentKey, 'run-0', 1, note, blob.slice(0, -1)), /decryption failed/);
  // Bytes that open and are not the ones the envelope names.
  const other = await storedFile(contentKey, 'run-0', 1, new TextEncoder().encode('%PDF-1.7 another one'));
  await assert.rejects(openFile(contentKey, 'run-0', 1, note, other), /not the file the task names/);
  await assert.rejects(openFile(contentKey, 'run-0', 1, { ...note, size: note.size + 1 }, blob), /not the file/);
});

test('an envelope names its files, and one that names them badly is not drawn', () => {
  const file = { name: 'a.pdf', content_type: 'application/pdf', size: 3, sha256: 'a'.repeat(64) };
  assert.ok(isEnvelope(envelope({ files: [file] })));
  for (const bad of [
    { ...file, sha256: 'xyz' },
    { ...file, size: -1 },
    { ...file, size: '3' },
    { ...file, name: 7 },
    { name: 'a.pdf' },
    'a.pdf',
  ]) {
    assert.ok(!isEnvelope(envelope({ files: [bad] })), JSON.stringify(bad));
  }
  const { files: _, ...none } = envelope();
  assert.ok(!isEnvelope(none), 'an envelope without the member');
});

test('a file is saved under a name that is no path', () => {
  assert.equal(saveName('report.pdf'), 'report.pdf');
  assert.equal(saveName('отчёт за март.pdf'), 'отчёт за март.pdf');
  assert.equal(saveName('../../etc/passwd'), 'passwd');
  assert.equal(saveName('C:\\Users\\a\\evil.exe'), 'evil.exe');
  assert.equal(saveName('.bashrc'), '_bashrc');
  assert.equal(saveName('a<b>:c.txt'), 'a_b__c.txt');
  assert.equal(saveName(''), 'file');
  assert.equal(saveName('x'.repeat(300)).length, 200);
});

test('what the owner writes is counted in bytes', () => {
  assert.equal(replyBytes('abc'), 3);
  assert.equal(replyBytes('йцу'), 6);
});

test('what the page seals, a key of its own kind opens', async () => {
  const recipient = await newDevice();
  const sealed = await sealTo(recipient.point, 'answer', 'run-0', new TextEncoder().encode('ipfs://photo'));
  assert.equal(sealed.length, 1 + 65 + 12 + 12 + 16);
  assert.equal(new TextDecoder().decode(await openFrom(recipient, 'answer', 'run-0', sealed)), 'ipfs://photo');
  await assert.rejects(openFrom(recipient, 'rejection', 'run-0', sealed), /decryption failed/);
  const reply = await writeReply(envelope(), 'rejection', 'not this recipient');
  assert.equal(reply[0], 0x01);
  assert.notDeepEqual(reply, await writeReply(envelope(), 'rejection', 'not this recipient'), 'a fresh key and nonce every time');
});

test('a key that is not written as a point of the curve is not read', async () => {
  const device = await newDevice();
  const written = /not written `p256:…`/;
  for (const key of ['', 'ed25519:abc', 'P256:abc', ` ${device.pubkey}`, device.pubkey.slice(5)]) {
    assert.throws(() => readPubkey(key), written, key);
  }
  const point = /not an uncompressed point of 65 bytes/;
  const compressed = new Uint8Array([0x02, ...device.point.slice(1, 33)]);
  const mislabelled = new Uint8Array([0x02, ...device.point.slice(1)]);
  for (const bytes of [new Uint8Array(0), compressed, mislabelled, device.point.slice(0, 64), new Uint8Array([...device.point, 0])]) {
    assert.throws(() => readPubkey(writePubkey(bytes)), point, String(bytes.length));
  }
  await assert.rejects(writeReply(envelope({ reply_pubkey: 'ed25519:abc' }), 'answer', 'words'), written);
});

test('what is of another format, or too short to be anything, does not open', async () => {
  const device = await goldenDevice();
  const copy = fromHex(GOLDEN.device_copy);
  const content = fromHex(GOLDEN.content);
  const key = fromHex(GOLDEN.content_key);
  const failed = /^Error: decryption failed$/;
  const as = (blob, first) => new Uint8Array([first, ...blob.slice(1)]);
  await assert.rejects(openFrom(device, 'device-copy', GOLDEN.task, as(copy, 0x02)), failed);
  await assert.rejects(openFrom(device, 'device-copy', GOLDEN.task, as(copy, 0x00)), failed);
  await assert.rejects(openFrom(device, 'device-copy', GOLDEN.task, copy.slice(0, 1 + 65 + 12 + 15)), failed);
  await assert.rejects(openContent(key, GOLDEN.task, as(content, 0x02)), failed);
  await assert.rejects(openContent(key, GOLDEN.task, content.slice(0, 1 + 12 + 15)), failed);
  await assert.rejects(openContent(key, GOLDEN.task, new Uint8Array(0)), failed);
  await assert.rejects(openContent(key.slice(0, 31), GOLDEN.task, content), failed, 'a key of another length');
  // A point that is not on the curve, where the sender's key is.
  const off = new Uint8Array(copy);
  off.fill(0xff, 2, 66);
  await assert.rejects(openFrom(device, 'device-copy', GOLDEN.task, off), failed);
  // One bit of the ciphertext, of the nonce and of the tag.
  for (const at of [1 + 65, 1 + 65 + 12, copy.length - 1]) {
    const changed = new Uint8Array(copy);
    changed[at] ^= 1;
    await assert.rejects(openFrom(device, 'device-copy', GOLDEN.task, changed), failed, String(at));
  }
});

test('an envelope whose answer, display or header is not whole is not drawn', () => {
  assert.ok(isEnvelope(envelope({ answer_by: { operation: 'supply', supplies: 'text' } })));
  assert.ok(isEnvelope(envelope({ answer_by: { operation: 'supply', supplies: 'file' }, kind: 'input' })));
  assert.ok(isEnvelope(envelope({ display: { title: '', fields: [] } })));
  for (const over of [
    { answer_by: { operation: 'confirm', supplies: 'money' } },
    { answer_by: { operation: 'confirm' } },
    { answer_by: { operation: 7, supplies: 'nothing' } },
    { answer_by: null },
    { answer_by: 'confirm' },
    { display: null },
    { display: 'Send an email' },
    { display: { title: 'Send an email' } },
    { display: { title: 7, fields: [] } },
    { display: { title: 'Send an email', fields: {} } },
    { display: { title: 'Send an email', fields: [null] } },
    { display: { title: 'Send an email', fields: ['To'] } },
    { display: { title: 'Send an email', fields: [{ kind: 'text', label: 7, values: [], written_by: 'agent' }] } },
    { display: { title: 'Send an email', fields: [{ kind: 'text', label: 'l', values: ['a', 7], written_by: 'agent' }] } },
    { files: null },
    { files: [null] },
    { created_at: '1790000000' },
    { expires_at: null },
    { v: '1' },
    { v: 0 },
    { id: 7 },
    { owner: null },
    { preparer: ['agent.near'] },
    { profile: undefined },
    { project: 7 },
    { project_uuid: 7 },
    { reply_pubkey: null },
    { thread: 7 },
    { policy_hash: 7 },
    { build: 'xyz' },
    { build: undefined },
    { state_hash: null },
  ]) {
    assert.ok(!isEnvelope(envelope(over)), JSON.stringify(over));
  }
  for (const none of [undefined, 7, 'envelope', true, [], [envelope()], {}]) assert.ok(!isEnvelope(none), JSON.stringify(none));
});

test('every kind of field the page draws is an envelope\'s, written by the project or by the agent', () => {
  for (const kind of ['money', 'account', 'address', 'text', 'long_text', 'list']) {
    for (const written_by of ['project', 'agent']) {
      const fields = [{ kind, label: 'l', values: [], written_by }, { kind, label: '', values: ['a', 'b'], written_by }];
      assert.ok(isEnvelope(envelope({ display: { title: 't', fields } })), `${kind} ${written_by}`);
    }
  }
  for (const kind of ['link', 'image', 'url', 'markdown', 'Text', '']) {
    const fields = [{ kind, label: 'l', values: [], written_by: 'agent' }];
    assert.ok(!isEnvelope(envelope({ display: { title: 't', fields } })), kind);
  }
});

test('a name that is nothing but a path, dots or spaces is saved as a name all the same', () => {
  assert.equal(saveName('dir/'), 'file');
  assert.equal(saveName('/'), 'file');
  assert.equal(saveName('   '), 'file');
  assert.equal(saveName('..'), '_');
  assert.equal(saveName('...hidden'), '_hidden');
  assert.equal(saveName('a/b\\c/../report.pdf'), 'report.pdf');
  assert.equal(saveName('line\nbreak\ttab\u0000nul\u007f.txt'), 'line_break_tab_nul_.txt');
  assert.equal(saveName('what?*|".txt'), 'what____.txt');
  assert.equal(saveName('  padded.txt  '), 'padded.txt');
  for (const name of ['../../etc/passwd', 'C:\\x\\y', '.\\..\\z', 'a/b', '\u0000/\u0001']) {
    assert.ok(!/[\\/\u0000-\u001f:]/.test(saveName(name)), JSON.stringify(name));
    assert.ok(saveName(name).length > 0);
  }
});

test('the bound of a reply is in bytes of UTF-8', async () => {
  const { MOST_REPLY_BYTES } = await import('../lib/inbox/crypto.ts');
  assert.equal(MOST_REPLY_BYTES, 5000);
  assert.equal(replyBytes(''), 0);
  assert.equal(replyBytes('👍'), 4);
  assert.equal(replyBytes('a'.repeat(MOST_REPLY_BYTES)), MOST_REPLY_BYTES);
  assert.ok(replyBytes('й'.repeat(MOST_REPLY_BYTES / 2 + 1)) > MOST_REPLY_BYTES, 'fewer characters than the bound, and more bytes');
});

test('a reply is sealed to the task\'s reply key, for its purpose and its task', async () => {
  const reader = await newDevice();
  const to = envelope({ reply_pubkey: reader.pubkey, id: 'run-7' });
  const answer = await writeReply(to, 'answer', 'ipfs://фото');
  assert.equal(new TextDecoder().decode(await openFrom(reader, 'answer', 'run-7', answer)), 'ipfs://фото');
  await assert.rejects(openFrom(reader, 'rejection', 'run-7', answer), /decryption failed/);
  await assert.rejects(openFrom(reader, 'answer', 'run-0', answer), /decryption failed/);
  await assert.rejects(openFrom(reader, 'device-copy', 'run-7', answer), /decryption failed/);
  const reason = await writeReply(to, 'rejection', '');
  assert.equal(reason.length, 1 + 65 + 12 + 16, 'a reason of no words is still sealed');
  assert.deepEqual(await openFrom(reader, 'rejection', 'run-7', reason), new Uint8Array(0));
});

test('the deadline of the sentence is written to the second, in UTC', () => {
  assert.equal(
    statement('owner.near', 'p256:abc', 1790000000),
    `Sign in to OutLayer as owner.near. Device key: p256:abc. Valid until ${new Date(1790000000000).toISOString().slice(0, 19)}Z.`,
  );
  assert.match(statement('owner.near', 'p256:abc', 1790000000), /Valid until \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\.$/);
  assert.match(statement('owner.near', 'p256:abc', 0), /Valid until 1970-01-01T00:00:00Z\.$/);
});

test('hex is two digits a byte, in lower case', () => {
  assert.equal(toHex(new Uint8Array([0, 1, 15, 16, 255])), '00010f10ff');
  assert.equal(toHex(new Uint8Array(0)), '');
});

test('the sentence that confirms an action is the one the coordinator rebuilds', async () => {
  const { confirmation } = await import('../lib/inbox/crypto.ts');
  const at = 1793275200;
  assert.equal(
    await confirmation('alice.near', { withdraw_device: '0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11' }, at),
    'Confirm in OutLayer as alice.near: withdraw the device 0b9c1a52-7c1e-4a53-9c58-2f0c8f6f3b11. At 2026-10-29T12:00:00Z.',
  );
  assert.equal(await confirmation('alice.near', { remove_webhook: true }, at), 'Confirm in OutLayer as alice.near: remove the webhook. At 2026-10-29T12:00:00Z.');
  const named = await confirmation('alice.near', { name_webhook: 'https://example.com/h' }, at);
  // The URL is named by its hash: the wallet shows no address.
  assert.match(named, /^Confirm in OutLayer as alice\.near: name the webhook [0-9a-f]{64}\. At 2026-10-29T12:00:00Z\.$/);
  assert.ok(!named.includes('example.com'));
});
