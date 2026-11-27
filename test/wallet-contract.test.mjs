import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { KeyPair } from '@near-js/crypto';
import { actionCreators, createTransaction, decodeSignedTransaction, encodeTransaction } from '@near-js/transactions';
import { sha256 } from '@noble/hashes/sha256';
import {
  AGENT_KEY_NONCE,
  AGENT_KEY_RECIPIENT,
  agentKeyMessage,
  agentKeySeed,
  createAccountActions,
  deterministicAccount,
  fundPageKeyActions,
  implicitAccountOf,
  signStateInitTransaction,
  stateBytes,
  stateInitBytes,
  transactionFrame,
  fromBase58,
  fromBase64,
  fromHex,
  installAndDropKeyActions,
  installActions,
  isSubAccountName,
  openAgentKey,
  pairText,
  publicKeyOfSeed,
  sealAgentKey,
  signTransaction,
  toHex,
} from '../lib/wallet-contract.ts';

// The Rust implementation's own vector (`custody-core/vectors/keys.json`), byte for byte.
const keys = JSON.parse(readFileSync(new URL('./fixtures/custody-keys.json', import.meta.url), 'utf8'));

test("the request for the agent's key is the one the enclave's crate derives from", () => {
  assert.equal(agentKeyMessage(keys.owner, keys.wallet_id), keys.agent.nep413_message);
  assert.equal(AGENT_KEY_RECIPIENT, keys.agent.nep413_recipient);
  assert.equal(toHex(AGENT_KEY_NONCE), keys.agent.nep413_nonce);
  assert.equal(AGENT_KEY_NONCE.length, 32);
});

test("the agent's key follows from the owner's signature as in the crate", async () => {
  const seed = await agentKeySeed(fromHex(keys.agent.signature, 64), keys.owner, keys.wallet_id);
  assert.equal(toHex(seed), keys.agent.seed);
  assert.equal(toHex(await publicKeyOfSeed(seed)), keys.agent.public_key);
  await assert.rejects(agentKeySeed(new Uint8Array(63), keys.owner, keys.wallet_id));
});

test('the pair is agent then TEE, and two equal keys are not a pair', () => {
  const agent = fromHex(keys.agent.public_key, 32);
  assert.equal(pairText(agent, keys.tee.public_key), keys.agent.public_key + keys.tee.public_key);
  assert.throws(() => pairText(agent, keys.agent.public_key));
  assert.throws(() => pairText(agent, keys.tee.public_key.toUpperCase()));
});

test("the agent's key is sealed to the agent and to this wallet alone", async () => {
  const recipient = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const recipientHex = toHex(new Uint8Array(await crypto.subtle.exportKey('raw', recipient.publicKey)));
  const seed = fromHex(keys.agent.seed, 32);

  const sealed = await sealAgentKey(recipientHex, seed, keys.wallet_id);
  assert.equal(sealed.length, 1 + 32 + 32 + 16);
  assert.deepEqual(await openAgentKey(recipient, sealed, keys.wallet_id), seed);

  await assert.rejects(openAgentKey(recipient, sealed, 'another-wallet'));
  const other = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  await assert.rejects(openAgentKey(other, sealed, keys.wallet_id));
  // sealed again, it is other bytes: a fresh key pair each time
  assert.notDeepEqual(await sealAgentKey(recipientHex, seed, keys.wallet_id), sealed);
});

test('base58 reads a code hash as its 32 bytes', () => {
  assert.equal(
    toHex(fromBase58('651XC7DH8J4Xczf8JKXH9pyveBY8ZuNCfy5HZ3SvuSiL')),
    '4b5158b0d1e911e86575ec7aa3cd07d5df23b5aa5572544aa981b5e154eb6771',
  );
  assert.equal(fromBase58('11111111111111111111111111111111').length, 32);
  assert.throws(() => fromBase58('0OIl'));
});

test('a sub-account name is one segment', () => {
  for (const name of ['agent', 'trader-1', 'a_b', '7']) assert.ok(isSubAccountName(name), name);
  for (const name of ['', 'Agent', 'a.b', '-a', 'a-', 'a--b', 'a b']) assert.ok(!isSubAccountName(name), name);
});

test("the owner's transaction creates the account with the page's key alone", () => {
  const page = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  const actions = createAccountActions(page);
  assert.deepEqual(actions.map((a) => a.enum), ['createAccount', 'transfer', 'addKey']);
  assert.equal(actions[2].addKey.publicKey.toString(), page);
});

test("the owner's own account installs the contract with no key added", () => {
  const pair = keys.agent.public_key + keys.tee.public_key;
  const actions = installActions(pair);
  assert.deepEqual(actions.map((a) => a.enum), ['useGlobalContract', 'functionCall']);
  assert.equal(actions[1].functionCall.methodName, 'w_init');
  assert.equal(actions[1].functionCall.deposit, 1n);
});

test("the new account's own transaction installs the contract and drops its only key", async () => {
  const pageKey = KeyPair.fromRandom('ed25519');
  const page = pageKey.getPublicKey().toString();
  const pair = keys.agent.public_key + keys.tee.public_key;

  const actions = installAndDropKeyActions(pair, page);
  assert.deepEqual(actions.map((a) => a.enum), ['useGlobalContract', 'functionCall', 'deleteKey']);
  assert.equal(actions[1].functionCall.methodName, 'w_init');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(actions[1].functionCall.args)), { public_key: pair });
  assert.equal(actions[1].functionCall.deposit, 1n);
  assert.equal(actions[2].deleteKey.publicKey.toString(), page);

  // signed by the page's key, it is a transaction of the account to itself
  const signed = await signTransaction(pageKey, 'agent.alice.testnet', 'agent.alice.testnet', 8n, new Uint8Array(32), actions);
  const decoded = decodeSignedTransaction(fromBase64(signed));
  assert.equal(decoded.transaction.signerId, 'agent.alice.testnet');
  assert.equal(decoded.transaction.receiverId, 'agent.alice.testnet');
  assert.equal(decoded.transaction.nonce, 8n);
  assert.equal(decoded.transaction.actions.length, 3);
});

const deterministic = JSON.parse(readFileSync(new URL('./fixtures/custody-deterministic.json', import.meta.url), 'utf8'));

test("a 0s wallet contract's state, StateInit and address are custody-core's", () => {
  assert.equal(deterministic.cases.length, 3);
  for (const c of deterministic.cases) {
    assert.equal(toHex(stateBytes(c.pair)), c.state, `${c.name}: state`);
    assert.equal(toHex(stateInitBytes(c.pair, deterministic.code_hash)), c.state_init, `${c.name}: state_init`);
    assert.equal(deterministicAccount(c.pair, deterministic.code_hash), c.account_id, `${c.name}: address`);
  }
  assert.ok(deterministic.cases.some((c) => c.account_id === '0scaf38f4da73c18308919d2f94e5445cd4131e2a5'));
});

test("the owner's transaction for a 0s account is one transfer to the page's key", () => {
  const actions = fundPageKeyActions();
  assert.deepEqual(actions.map((a) => a.enum), ['transfer']);
  const key = KeyPair.fromRandom('ed25519');
  assert.match(implicitAccountOf(key), /^[0-9a-f]{64}$/);
});

test('the StateInit transaction is framed as the library frames a transaction, and signed over it', () => {
  const key = KeyPair.fromRandom('ed25519');
  const signer = implicitAccountOf(key);
  const blockHash = new Uint8Array(32).fill(7);
  // the frame, against the library's own encoding of a transaction with one transfer of 5
  const u128 = (n) => { const b = new Uint8Array(16); new DataView(b.buffer).setBigUint64(0, n, true); return b; };
  const library = encodeTransaction(createTransaction(signer, key.getPublicKey(), 'bob.testnet', 9n, [actionCreators.transfer(5n)], blockHash));
  const ours = transactionFrame(key.getPublicKey().data, signer, 'bob.testnet', 9n, blockHash, Uint8Array.of(3, ...u128(5n)));
  assert.equal(toHex(ours), toHex(library));

  const pair = deterministic.cases[0].pair;
  const signed = fromBase64(signStateInitTransaction(key, signer, 9n, blockHash, pair));
  const tx = signed.slice(0, signed.length - 65);
  const action = Uint8Array.of(11, ...stateInitBytes(pair), ...new Uint8Array(16));
  assert.equal(toHex(tx), toHex(transactionFrame(key.getPublicKey().data, signer, deterministicAccount(pair), 9n, blockHash, action)));
  assert.equal(signed[signed.length - 65], 0, 'an ed25519 signature');
  assert.ok(key.verify(sha256(tx), signed.slice(signed.length - 64)), 'signed over the transaction');
});

