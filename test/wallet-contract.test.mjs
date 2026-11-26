import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { KeyPair } from '@near-js/crypto';
import { decodeSignedTransaction } from '@near-js/transactions';
import {
  AGENT_KEY_NONCE,
  AGENT_KEY_RECIPIENT,
  agentKeyMessage,
  agentKeySeed,
  createAccountActions,
  fromBase58,
  fromBase64,
  fromHex,
  installAndDropKeysActions,
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

test("the owner's transaction creates the account with the owner's key and the page's", () => {
  const owner = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  const page = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  const actions = createAccountActions(owner, page);
  assert.deepEqual(actions.map((a) => a.enum), ['createAccount', 'transfer', 'addKey', 'addKey']);
  assert.equal(actions[2].addKey.publicKey.toString(), owner);
  assert.equal(actions[3].addKey.publicKey.toString(), page);
});

test("the account's own transaction installs the contract and drops the keys it is told to", async () => {
  const pageKey = KeyPair.fromRandom('ed25519');
  const page = pageKey.getPublicKey().toString();
  const owner = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  const pair = keys.agent.public_key + keys.tee.public_key;

  const kept = installAndDropKeysActions(pair, page, null);
  assert.deepEqual(kept.map((a) => a.enum), ['useGlobalContract', 'functionCall', 'deleteKey']);
  assert.equal(kept[1].functionCall.methodName, 'w_init');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(kept[1].functionCall.args)), { public_key: pair });
  assert.equal(kept[1].functionCall.deposit, 1n);
  assert.equal(kept[2].deleteKey.publicKey.toString(), page);

  const removed = installAndDropKeysActions(pair, page, owner);
  assert.deepEqual(removed.map((a) => a.enum), ['useGlobalContract', 'functionCall', 'deleteKey', 'deleteKey']);
  assert.equal(removed[2].deleteKey.publicKey.toString(), owner);
  assert.equal(removed[3].deleteKey.publicKey.toString(), page);

  // signed by the page's key, it is a transaction of the account to itself
  const signed = await signTransaction(pageKey, 'agent.alice.testnet', 'agent.alice.testnet', 8n, new Uint8Array(32), removed);
  const decoded = decodeSignedTransaction(fromBase64(signed));
  assert.equal(decoded.transaction.signerId, 'agent.alice.testnet');
  assert.equal(decoded.transaction.receiverId, 'agent.alice.testnet');
  assert.equal(decoded.transaction.nonce, 8n);
  assert.equal(decoded.transaction.actions.length, 4);
});
