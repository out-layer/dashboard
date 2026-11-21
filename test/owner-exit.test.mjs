// What the /exit page reads before it asks the wallet for anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountsOf, formatNear, formatWindow, networkOfLink, nsDate, pendingExitOf, readExitLink } from '../lib/owner-exit.ts';

const b64url = (s) => Buffer.from(s).toString('base64url');
const KEY_HASH = 'ab'.repeat(32);
const token = (payload) => `${b64url(JSON.stringify(payload))}.${b64url('mac')}`;
const daoOf = (network) => (network === 'mainnet' ? 'dao.outlayer.near' : 'dao.outlayer.testnet');

test('a link is read as the coordinator wrote it', () => {
  const link = readExitLink(token({ key_hash: KEY_HASH, seed: '7', dao: 'dao.outlayer.near', expires_at: 1800000000 }));
  assert.deepEqual(link, { key_hash: KEY_HASH, seed: '7', dao: 'dao.outlayer.near', expires_at: 1800000000 });
  // No seed: the owner's next free number.
  assert.equal(readExitLink(token({ key_hash: KEY_HASH, dao: 'dao.outlayer.testnet', expires_at: 1 })).seed, undefined);
});

test('a link that is not one is refused, not guessed at', () => {
  assert.equal(readExitLink('nothing'), null);
  assert.equal(readExitLink(`${b64url('not json')}.${b64url('mac')}`), null);
  assert.equal(readExitLink(token({ key_hash: 'short', dao: 'dao.outlayer.near', expires_at: 1 })), null);
  assert.equal(readExitLink(token({ key_hash: KEY_HASH, expires_at: 1 })), null);
  assert.equal(readExitLink(token({ key_hash: KEY_HASH, dao: 'dao.outlayer.near', expires_at: '1' })), null);
  assert.equal(readExitLink(token({ key_hash: KEY_HASH, seed: 7, dao: 'dao.outlayer.near', expires_at: 1 })), null);
});

test("a link's network is its DAO's, and another DAO is no network", () => {
  const of = (dao) => networkOfLink({ key_hash: KEY_HASH, dao, expires_at: 1 }, daoOf);
  assert.equal(of('dao.outlayer.near'), 'mainnet');
  assert.equal(of('dao.outlayer.testnet'), 'testnet');
  assert.equal(of('dao.evil.near'), null);
});

test('fees and windows are shown as the contract holds them', () => {
  assert.equal(formatNear(250000000000000000000000n), '0.25');
  assert.equal(formatNear(100000000000000000000000n), '0.1');
  assert.equal(formatNear(2000000000000000000000000n), '2');
  assert.equal(formatNear(1n), '0.000000000000000000000001');
  assert.equal(formatWindow(86400), '24 h');
  assert.equal(formatWindow(172800), '48 h');
  assert.equal(formatWindow(3600), '1 h');
  assert.equal(formatWindow(600), '10 min');
  assert.equal(formatWindow(90), '90 s');
});

test('a block timestamp is a date, as a number or as a string', () => {
  assert.equal(nsDate('1800000000000000000').getTime(), 1800000000000);
  assert.equal(nsDate(1800000000000000000).getTime(), 1800000000000);
});

test('a pending exit is told from a pending approver change', () => {
  const owner = {
    generation: 1, exit_window_secs: 86400, pending_exit_window: null, approvers: ['a.near'], threshold: 1,
    claim_in_flight: false, escrow_check: null,
    pending: { nonce: 3, kind: { Exit: { finalize_after: '1800000000000000000', finalize_before: '1800604800000000000' } }, approvals: ['a.near'] },
  };
  const exit = pendingExitOf(owner);
  assert.equal(exit.nonce, 3);
  assert.equal(exit.finalizeBefore.getTime() - exit.finalizeAfter.getTime(), 7 * 86400 * 1000);
  assert.deepEqual(exit.approvals, ['a.near']);
  // A vote of an account no longer in the set is not counted, as the contract does not.
  assert.deepEqual(pendingExitOf({ ...owner, approvers: ['b.near'] }).approvals, []);
  assert.equal(pendingExitOf({ ...owner, pending: { nonce: 4, kind: { SetApprovers: { approvers: [], threshold: 0 } }, approvals: [] } }), null);
  assert.equal(pendingExitOf({ ...owner, pending: null }), null);
});

test('approvers are account ids, each named once', () => {
  assert.deepEqual(accountsOf('alice.near, bob.near\ncarol.testnet'), { ok: true, accounts: ['alice.near', 'bob.near', 'carol.testnet'] });
  assert.deepEqual(accountsOf('  '), { ok: true, accounts: [] });
  assert.equal(accountsOf('Alice.near').ok, false);
  assert.equal(accountsOf('a..near').ok, false);
  assert.equal(accountsOf('alice.near alice.near').ok, false);
});
