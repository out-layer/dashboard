// The 0s wallet contract's creation against a chain that fails in each way the page has to
// survive: what the function returns or throws is decided by what the chain shows after,
// never by an answer that may have been lost.
import assert from 'node:assert/strict';
import test from 'node:test';
import { KeyPair } from '@near-js/crypto';
import { createDeterministicAccount, deterministicAccount, implicitAccountOf, PageKeyClosed } from '../lib/wallet-contract.ts';

const PAIR = 'ab'.repeat(32) + 'cd'.repeat(32);
const OWNER = 'alice.testnet';
const BLOCK = '11111111111111111111111111111111';

/** A chain of two accounts: the one-time key's and the wallet contract's. `sends` scripts each send_tx in order. */
function chain(sends, start = {}) {
  const state = { keyAccount: true, pair: null, sent: 0, ...start };
  const answer = (result) => ({ json: async () => ({ result }) });
  const refuse = (name) => ({ json: async () => ({ error: { message: name, data: { name } } }) });
  globalThis.fetch = async (_url, init) => {
    const { method, params } = JSON.parse(init.body);
    if (method === 'send_tx') {
      const step = sends[state.sent++];
      assert.ok(step, `an unexpected send_tx number ${state.sent}`);
      return step(state, answer, refuse);
    }
    const key = implicitAccountOf(KEY);
    if (params.request_type === 'view_access_key') return state.keyAccount ? answer({ nonce: 7, block_hash: BLOCK }) : refuse('UNKNOWN_ACCESS_KEY');
    if (params.request_type === 'view_account') {
      const there = params.account_id === key ? state.keyAccount : state.pair !== null;
      return there ? answer({ amount: '0' }) : refuse('UNKNOWN_ACCOUNT');
    }
    if (params.request_type === 'call_function') {
      if (state.pair === null) return refuse('UNKNOWN_ACCOUNT');
      return answer({ result: [...new TextEncoder().encode(JSON.stringify(state.pair))] });
    }
    throw new Error(`an unexpected query ${JSON.stringify(params)}`);
  };
  return state;
}
const KEY = KeyPair.fromRandom('ed25519');
const ok = { transaction: { hash: 'h' }, status: { SuccessValue: '' } };
// what a send does to the chain, and what the page hears of it
const created = (s, answer) => ((s.pair = PAIR), answer(ok));
const createdAnswerLost = (s) => { s.pair = PAIR; throw new Error('network'); };
const failedOnChain = (_s, answer) => answer({ transaction: { hash: 'h' }, status: { Failure: { ActionError: 'x' } } });
const notSent = () => { throw new Error('network'); };
const closed = (s, answer) => ((s.keyAccount = false), answer(ok));
const closedAnswerLost = (s) => { s.keyAccount = false; throw new Error('network'); };

test('created and closed: the account, and the one-time key gone', async () => {
  const state = chain([created, closed]);
  assert.equal(await createDeterministicAccount('rpc', KEY, OWNER, PAIR), deterministicAccount(PAIR));
  assert.deepEqual([state.sent, state.keyAccount], [2, false]);
});

test('the StateInit failed on chain: the key is closed, and the page is told the NEAR came back', async () => {
  chain([failedOnChain, closed]);
  await assert.rejects(createDeterministicAccount('rpc', KEY, OWNER, PAIR), (e) => e instanceof PageKeyClosed && /came back/.test(e.message));
});

test('an answer lost on the way does not hide a contract that was created', async () => {
  const state = chain([createdAnswerLost, closedAnswerLost]);
  assert.equal(await createDeterministicAccount('rpc', KEY, OWNER, PAIR), deterministicAccount(PAIR));
  assert.equal(state.keyAccount, false);
});

test('nothing was sent: the same key is kept for the next press, and the error is not the closed one', async () => {
  const state = chain([notSent, notSent]);
  await assert.rejects(createDeterministicAccount('rpc', KEY, OWNER, PAIR), (e) => !(e instanceof PageKeyClosed) && /same one-time key/.test(e.message));
  assert.equal(state.keyAccount, true);
});

test('created, but the close did not go: the key is closed by a second try', async () => {
  const state = chain([created, notSent, closed]);
  assert.equal(await createDeterministicAccount('rpc', KEY, OWNER, PAIR), deterministicAccount(PAIR));
  assert.deepEqual([state.sent, state.keyAccount], [3, false]);
});

test('a StateInit to the account that exists already with this pair is the account', async () => {
  // the retry after a lost answer: nearcore fails the second StateInit, and the pair is there
  const state = chain([failedOnChain, closed], { pair: PAIR });
  assert.equal(await createDeterministicAccount('rpc', KEY, OWNER, PAIR), deterministicAccount(PAIR));
  assert.equal(state.keyAccount, false);
});
