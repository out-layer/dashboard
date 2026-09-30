import assert from 'node:assert/strict';
import test from 'node:test';
import { muteOf, webhookUrlOf } from '../lib/inbox/settings.ts';

test('an account names an agent, a uuid names a project', () => {
  assert.deepEqual(muteOf('  agent.near '), { ok: true, mute: { subject_is: 'agent', subject: 'agent.near' } });
  assert.deepEqual(muteOf('p0000000000000a1f'), { ok: true, mute: { subject_is: 'project', subject: 'p0000000000000a1f' } });
  assert.deepEqual(muteOf('a'.repeat(64)).ok, true);
});

test('what is neither names nobody, and nothing is sent', () => {
  for (const typed of ['', '   ', 'Agent.near', 'a', 'a'.repeat(65), 'agent..near', '.near', 'agent near', 'owner.near/gmail']) {
    const named = muteOf(typed);
    assert.equal(named.ok, false, typed);
    assert.ok(named.why.length > 0);
  }
});

test('a project uuid of another length or alphabet is an account or nothing, never a project', () => {
  assert.equal(muteOf('p000000000000000g').mute?.subject_is, 'agent');
  assert.equal(muteOf('p00000000000000001').mute?.subject_is, 'agent');
  assert.equal(muteOf('P0000000000000001').ok, false);
});

test('a webhook is an https URL without credentials', () => {
  assert.deepEqual(webhookUrlOf(' https://example.com/hook?x=1 '), { ok: true, url: 'https://example.com/hook?x=1' });
  for (const typed of ['', 'example.com', 'http://example.com', 'ftp://example.com', 'https://user:pass@example.com', `https://example.com/${'a'.repeat(2048)}`]) {
    assert.equal(webhookUrlOf(typed).ok, false, typed);
  }
});

test('a session another sign-in replaced is an ended session that says why', async () => {
  const { InboxRefused } = await import('../lib/inbox/api.ts');
  const replaced = new InboxRefused('signed in elsewhere', 401, 'session_replaced', false);
  assert.equal(replaced.sessionEnded, true);
  assert.equal(replaced.sessionReplaced, true);
  const over = new InboxRefused('sign in', 401, 'session_required', false);
  assert.equal(over.sessionEnded, true);
  assert.equal(over.sessionReplaced, false);
  const other = new InboxRefused('no such task', 404, 'task_not_found', true);
  assert.equal(other.sessionEnded, false);
});

test('an answer about the webhook is whole or it is a refusal', async () => {
  const { readWebhook, InboxRefused } = await import('../lib/inbox/api.ts');
  const none = { url: null, set_at: null, set_by_key: null, set_here: false };
  assert.deepEqual(readWebhook(none), none);
  const named = { url: 'https://example.com/h', set_at: 1790000000, set_by_key: 'ed25519:abc', set_here: false };
  assert.deepEqual(readWebhook(named), named);
  for (const broken of [null, {}, { url: 'https://example.com/h' }, { ...named, set_here: 'no' }, { ...named, url: 5 }, { ...named, set_at: 'now' }]) {
    assert.throws(() => readWebhook(broken), InboxRefused, JSON.stringify(broken));
  }
});

test('a list says whether it is whole, and an answer without a list is a refusal', async () => {
  const { readListed, InboxRefused } = await import('../lib/inbox/api.ts');
  assert.deepEqual(readListed({ tasks: [], more: false }), { tasks: [], more: false });
  assert.equal(readListed({ tasks: [], more: true }).more, true);
  // A state this build does not know is never read as open.
  assert.equal(readListed({ tasks: [{ id: 'run-0', state: 'paused' }], more: false }).tasks[0].state, 'unknown');
  for (const broken of [null, {}, { tasks: null }, { more: true }]) {
    assert.throws(() => readListed(broken), InboxRefused, JSON.stringify(broken));
  }
});

test('a name that names nobody is refused in words that say why', () => {
  assert.equal(muteOf('').why, 'Name an agent by its account, or a project by its uuid.');
  assert.equal(muteOf(' \t\n').why, 'Name an agent by its account, or a project by its uuid.');
  assert.equal(muteOf(' Agent.near ').why, '"Agent.near" is neither an account id nor a project\'s uuid.');
  assert.ok(!('mute' in muteOf('Agent.near')));
});

test('an account of every shape the chain allows names an agent', () => {
  const implicit = 'a1'.repeat(32);
  for (const typed of ['aa', 'a-b.near', 'a_b.testnet', 'sub.agent.near', '0x.near', implicit]) {
    assert.deepEqual(muteOf(typed), { ok: true, mute: { subject_is: 'agent', subject: typed } }, typed);
  }
  for (const typed of ['-a.near', 'a-.near', 'a--b.near', 'a_-b.near', 'agent.near.', 'agent@near', 'агент.near']) {
    assert.equal(muteOf(typed).ok, false, typed);
  }
});

test('a URL that cannot be a webhook is refused in words that say why', () => {
  assert.equal(webhookUrlOf('   ').why, 'Name the URL.');
  assert.equal(webhookUrlOf(`https://example.com/${'a'.repeat(2048)}`).why, 'The URL is too long.');
  for (const typed of ['example.com', '/hook', 'https://', 'https:// example.com']) {
    assert.equal(webhookUrlOf(typed).why, 'This is not a URL.', typed);
  }
  for (const typed of ['http://example.com/h', 'ftp://example.com', 'javascript:alert(1)', 'data:text/plain,x', 'file:///etc/passwd', 'wss://example.com']) {
    assert.equal(webhookUrlOf(typed).why, 'The URL must start with https://.', typed);
  }
  for (const typed of ['https://user:pass@example.com', 'https://user@example.com', 'https://:pass@example.com', 'https://x@127.0.0.1/']) {
    assert.equal(webhookUrlOf(typed).why, 'The URL must not carry a user name or a password.', typed);
    assert.ok(!('url' in webhookUrlOf(typed)));
  }
});

test('a URL at the bound is taken, and one past it is not', () => {
  const at = `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`;
  assert.equal(at.length, 2048);
  assert.deepEqual(webhookUrlOf(at), { ok: true, url: at });
  assert.equal(webhookUrlOf(`${at}a`).ok, false);
  // The bound is on what is sent: the spaces around it are not counted.
  assert.deepEqual(webhookUrlOf(`  ${at}  `), { ok: true, url: at });
});

test('a URL that is taken is sent as it was typed', () => {
  for (const typed of ['HTTPS://Example.COM/Hook', 'https://example.com:8443/h?a=1&b=2#part', 'https://example.com', 'https://пример.рф/h']) {
    assert.deepEqual(webhookUrlOf(typed), { ok: true, url: typed }, typed);
  }
});

test('a moment is said as a day and a minute, from Unix seconds', async () => {
  const { when } = await import('../lib/inbox/settings.ts');
  const expected = new Date(1790000000 * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  assert.equal(when(1790000000), expected);
  assert.notEqual(when(1790000000), when(1790000060), 'a minute apart is another moment');
  assert.equal(when(1790000000), when(1790000001), 'a second apart is the same');
});

test('the secret of a webhook is read when it is told, and an answer without it is whole too', async () => {
  const { readWebhook, InboxRefused } = await import('../lib/inbox/api.ts');
  const named = { url: 'https://example.com/h', set_at: 1790000000, set_by_key: 'ed25519:abc', set_here: true };
  assert.equal(readWebhook(named).secret, undefined);
  assert.equal(readWebhook({ ...named, secret: 'whs_0123' }).secret, 'whs_0123');
  assert.throws(() => readWebhook({ ...named, secret: 7 }), InboxRefused);
});
