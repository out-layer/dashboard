import assert from 'node:assert/strict';
import test from 'node:test';
import { readCredit, readSwap, txHashOf, usdcWords } from '../lib/near-topup.ts';

const outcome = (value) => ({ status: { SuccessValue: btoa(JSON.stringify(value)) } });

test('a transaction that succeeded on chain with success:false is a swap that did not happen, with its reason', () => {
  assert.deepEqual(
    readSwap(outcome({ success: false, error: "Missing or invalid 'nonce' field in result", logs: ['1.'] })),
    { state: 'not_swapped', reason: "Missing or invalid 'nonce' field in result" },
  );
  assert.deepEqual(readSwap(outcome({ success: false })), { state: 'not_swapped', reason: 'The swap project gave no reason.' });
});

test('a swap that went through names its amount and the last transaction, the one that credits the key', () => {
  assert.deepEqual(
    readSwap(outcome({ success: true, usdc_amount: '310611', tx_hashes: ['deposit', 'transfer', 'credit'], logs: [] })),
    { state: 'swapped', usdc: '310611', creditTx: 'credit' },
  );
});

test('a transaction that failed on chain says what the contract said', () => {
  const failure = { ActionError: { kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked: Payment key not found' } } } };
  assert.deepEqual(readSwap({ status: { Failure: failure } }), { state: 'failed', reason: 'Smart contract panicked: Payment key not found' });
  assert.deepEqual(readSwap({ status: { Failure: { InvalidTxError: 'Expired' } } }), { state: 'failed', reason: '{"InvalidTxError":"Expired"}' });
});

test('an outcome with no final answer is unknown, never a success', () => {
  for (const seen of [
    null,
    undefined,
    {},
    { status: 'Started' },
    { status: { SuccessValue: '' } },
    { status: { SuccessReceiptId: 'x' } },
    { status: { SuccessValue: '@@not base64@@' } },
    outcome('a string'),
    outcome({ logs: [] }),
    outcome({ success: true }),
    outcome({ success: true, usdc_amount: '1', tx_hashes: [] }),
  ]) {
    assert.deepEqual(readSwap(seen), { state: 'unknown' }, JSON.stringify(seen));
  }
});

test('the credit is what the key kept: all of it, none of it, or not known yet', () => {
  assert.equal(readCredit(outcome('310611'), '310611'), true);
  // The key refused: the token handed the money back to the swap account, on a transaction that succeeded.
  assert.equal(readCredit(outcome('0'), '145423'), false);
  assert.equal(readCredit(outcome('100'), '145423'), false);
  assert.equal(readCredit({ status: { Failure: {} } }, '1'), false);
  assert.equal(readCredit(null, '1'), null);
  assert.equal(readCredit({ status: { SuccessValue: '' } }, '1'), null);
  assert.equal(readCredit(outcome(5), '1'), null);
});

test('the hash is found under either name a wallet returns it', () => {
  assert.equal(txHashOf({ transaction: { hash: 'a' } }), 'a');
  assert.equal(txHashOf({ transaction_outcome: { id: 'b' } }), 'b');
  assert.equal(txHashOf({}), null);
  assert.equal(txHashOf(undefined), null);
});

test('a stablecoin amount reads in dollars with no trailing zeros', () => {
  assert.equal(usdcWords('3690003'), '$3.690003');
  assert.equal(usdcWords('1000000'), '$1');
  assert.equal(usdcWords('310610'), '$0.31061');
  assert.equal(usdcWords('5'), '$0.000005');
});
