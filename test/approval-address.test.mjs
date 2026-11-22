import assert from 'node:assert/strict';
import test from 'node:test';
import { listsAddress, paymentDestination, unlistedDestination } from '../lib/approval-address.ts';

const asking = (list) => ({ rules: { addresses: { mode: 'whitelist', list, unlisted: 'ask' } } });
const pay = (to, kind = 'transfer') => ({ kind, to, amount: '1' });

test('only a payment has a destination the list asks about', () => {
  for (const kind of ['transfer', 'withdraw', 'intents_transfer', 'cross_chain_withdraw']) {
    assert.equal(paymentDestination(pay('bob.near', kind)), 'bob.near', kind);
  }
  for (const kind of ['call', 'delete', 'limit_order', 'confidential', 'intents_storage_deposit']) {
    assert.equal(paymentDestination(pay('bob.near', kind)), null, kind);
  }
  assert.equal(paymentDestination({ kind: 'transfer', amount: '1' }), null);
});

test('a payment off a list that asks names its address; a listed one does not', () => {
  assert.equal(unlistedDestination(asking(['alice.near']), pay('bob.near')), 'bob.near');
  assert.equal(unlistedDestination(asking(['alice.near', 'bob.near']), pay('bob.near')), null);
  assert.equal(unlistedDestination(asking(['alice.near']), pay('bob.near', 'call')), null);
});

test('a list that does not ask, another mode, or no policy names nothing', () => {
  assert.equal(unlistedDestination({ rules: { addresses: { mode: 'whitelist', list: ['alice.near'] } } }, pay('bob.near')), null);
  assert.equal(unlistedDestination({ rules: { addresses: { mode: 'blacklist', list: [], unlisted: 'ask' } } }, pay('bob.near')), null);
  assert.equal(unlistedDestination({ rules: { addresses: { list: ['alice.near'], unlisted: 'ask' } } }, pay('bob.near')), 'bob.near');
  assert.equal(unlistedDestination(null, pay('bob.near')), null);
  assert.equal(unlistedDestination({}, pay('bob.near')), null);
});

test('addresses compare as the engine compares them', () => {
  const evm = '0xAbCdEf0123456789abcdef0123456789ABCDEF01';
  assert.equal(listsAddress(evm, evm.toLowerCase()), true);
  assert.equal(listsAddress('Bob.near', 'bob.near'), false);
  assert.equal(unlistedDestination(asking([evm]), pay(evm.toLowerCase())), null);
  assert.equal(unlistedDestination(asking(['Bob.near']), pay('bob.near')), 'bob.near');
});
