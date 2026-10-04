// An approver pinned to one key stays pinned through the form.
//
// `pubkey` on an approver means only that key's signature counts for it.
// The form edits approvers as text lines; a line that dropped the pin on load
// would be saved back without it, and the approver could then vote with any
// full-access key of the account — a policy weakened by opening and saving it.
//
// Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approverLine, parseApproverLine, parsePolicyResponse } from '../lib/wallet-policy.ts';

const PIN = 'ed25519:7BcBZ9ZgzKqzCq3ULRr4K7G3jvWbLqTf9pzXQhwYpJmV';

test('a pinned approver reads back as a line that carries its key', () => {
  assert.equal(approverLine({ id: 'alice.near', role: 'signer', pubkey: PIN }), `alice.near, signer, ${PIN}`);
  assert.equal(approverLine({ id: 'bob.near', role: 'admin' }), 'bob.near, admin');
  assert.equal(approverLine({ id: 'carol.near' }), 'carol.near, signer', 'role defaults to signer');
});

test('a line parses back to the same approver, pin included', () => {
  assert.deepEqual(parseApproverLine(` alice.near , signer , ${PIN} `), { id: 'alice.near', role: 'signer', pubkey: PIN });
  assert.deepEqual(parseApproverLine('bob.near, admin'), { id: 'bob.near', role: 'admin' });
  assert.deepEqual(parseApproverLine('carol.near'), { id: 'carol.near', role: 'signer' });
  assert.equal(parseApproverLine('   '), null);
  assert.equal(parseApproverLine(', signer'), null);
});

test('a stored policy opened in the form keeps every pin', () => {
  const approvers = [
    { id: 'owner.near', role: 'admin', pubkey: PIN },
    { id: 'alice.near', role: 'signer', pubkey: PIN },
    { id: 'bob.near', role: 'signer' },
  ];
  const parsed = parsePolicyResponse({ approval: { threshold: { required: 2 }, approvers } });
  const back = parsed.approval.approvers.split('\n').map(parseApproverLine);
  assert.deepEqual(back, approvers);
});
