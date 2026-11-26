/**
 * Agent On-chain custody: what the owner's page computes when it sets up a
 * wallet contract.
 *
 * A wallet contract is a NEAR account that executes a request only under two
 * signatures: the agent's key and the wallet's key in OutLayer's enclave. The
 * owner installs it with the pair of public keys. The agent's key comes from
 * one signature of the owner's own key (the owner's wallet repeats it on
 * request, so the key needs no backup), and is handed to the agent sealed to a
 * one-time key the agent made.
 *
 * Every byte format here is held to the Rust implementation's vectors
 * (`custody-core`), in `test/wallet-contract.test.mjs`.
 */

import { type KeyPair, PublicKey } from '@near-js/crypto';
import {
  type Action,
  GlobalContractIdentifier,
  Signature,
  SignedTransaction,
  actionCreators,
  createTransaction,
  encodeTransaction,
} from '@near-js/transactions';

const utf8 = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(text: string, length: number): Uint8Array {
  if (text.length !== 2 * length || !/^[0-9a-f]*$/.test(text)) {
    throw new Error(`expected ${length} bytes in lowercase hex`);
  }
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = Number.parseInt(text.slice(2 * i, 2 * i + 2), 16);
  return out;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58 (the alphabet NEAR writes hashes and keys in) to bytes. */
export function fromBase58(text: string): Uint8Array {
  let value = BigInt(0);
  for (const char of text) {
    const digit = BASE58.indexOf(char);
    if (digit < 0) throw new Error('not base58');
    value = value * BigInt(58) + BigInt(digit);
  }
  const bytes: number[] = [];
  while (value > BigInt(0)) {
    bytes.unshift(Number(value & BigInt(0xff)));
    value >>= BigInt(8);
  }
  for (const char of text) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

// ── The agent's key ──────────────────────────────────────────────────────────

/** The NEP-413 recipient of the signature the agent's key comes from. */
export const AGENT_KEY_RECIPIENT = 'outlayer-agent-key';

/** Its nonce: fixed, so the same request gives the same signature. */
export const AGENT_KEY_NONCE: Uint8Array = concat(utf8.encode('outlayer/agent-key/v1/nonce'), new Uint8Array(5));

/** The message the owner's key signs for the agent's key of the wallet. */
export function agentKeyMessage(owner: string, walletId: string): string {
  return `This signature is the key of your OutLayer agent. Sign it only on app.outlayer.ai, when you set up or recover an agent.\nOwner: ${owner}\nWallet: ${walletId}`;
}

/** The 32-byte seed of the agent's key, from the owner's signature (64 bytes). */
export async function agentKeySeed(signature: Uint8Array, owner: string, walletId: string): Promise<Uint8Array> {
  if (signature.length !== 64) throw new Error('an Ed25519 signature is 64 bytes');
  const key = await subtle().importKey(
    'raw',
    utf8.encode('outlayer/agent-key/v1') as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = concat(signature, utf8.encode(agentKeyMessage(owner, walletId)));
  return new Uint8Array(await subtle().sign('HMAC', key, data as BufferSource));
}

/** PKCS#8 wrapping of a 32-byte Ed25519 seed. */
const PKCS8_ED25519 = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/** The Ed25519 public key of a 32-byte seed. */
export async function publicKeyOfSeed(seed: Uint8Array): Promise<Uint8Array> {
  if (seed.length !== 32) throw new Error('an Ed25519 seed is 32 bytes');
  const key = await subtle().importKey('pkcs8', concat(PKCS8_ED25519, seed) as BufferSource, 'Ed25519', true, ['sign']);
  const jwk = await subtle().exportKey('jwk', key);
  return fromBase64((jwk.x as string).replace(/-/g, '+').replace(/_/g, '/').padEnd(44, '='));
}

/**
 * The wallet contract's public key: `agent ‖ tee`, 128 characters of
 * lowercase hex. What `w_init` takes and `w_public_key` returns.
 */
export function pairText(agentPublicKey: Uint8Array, teePublicKeyHex: string): string {
  const tee = fromHex(teePublicKeyHex, 32);
  if (agentPublicKey.length !== 32) throw new Error('an Ed25519 public key is 32 bytes');
  if (toHex(agentPublicKey) === teePublicKeyHex) throw new Error('the two keys of a pair differ');
  return toHex(agentPublicKey) + toHex(tee);
}

// ── Sealing the agent's key to the agent ─────────────────────────────────────

const SEALED_FORMAT = 0x02;
const SEAL_KDF_INFO = utf8.encode('outlayer:encryption-keys:v1:seal:kdf');

/** What a sealed agent key is bound to: it opens for this wallet only. */
export function agentKeyAad(walletId: string): Uint8Array {
  return utf8.encode(`outlayer:wallet-contract:agent-key:${walletId}`);
}

async function sealKey(
  secret: CryptoKey,
  theirPublic: Uint8Array,
  ephemeralPublic: Uint8Array,
  recipientPublic: Uint8Array,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const their = await subtle().importKey('raw', theirPublic as BufferSource, { name: 'X25519' }, false, []);
  const shared = await subtle().deriveBits({ name: 'X25519', public: their }, secret, 256);
  const hkdf = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: concat(SEAL_KDF_INFO, ephemeralPublic, recipientPublic) as BufferSource,
    },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/**
 * Seal the agent's key to the agent's one-time X25519 public key. The format
 * is the SDK's (`sealTo`): a fresh key pair per message, so the nonce is zero.
 */
export async function sealAgentKey(recipientPublicKeyHex: string, seed: Uint8Array, walletId: string): Promise<Uint8Array> {
  const recipient = fromHex(recipientPublicKeyHex, 32);
  const ephemeral = (await subtle().generateKey({ name: 'X25519' }, false, ['deriveBits'])) as CryptoKeyPair;
  const ephemeralPublic = new Uint8Array(await subtle().exportKey('raw', ephemeral.publicKey));
  const key = await sealKey(ephemeral.privateKey, recipient, ephemeralPublic, recipient, 'encrypt');
  const sealed = await subtle().encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(12), additionalData: agentKeyAad(walletId) as BufferSource },
    key,
    seed as BufferSource,
  );
  return concat(Uint8Array.of(SEALED_FORMAT), ephemeralPublic, new Uint8Array(sealed));
}

/** Open what {@link sealAgentKey} sealed, with the recipient's key pair. */
export async function openAgentKey(recipient: CryptoKeyPair, sealed: Uint8Array, walletId: string): Promise<Uint8Array> {
  if (sealed[0] !== SEALED_FORMAT || sealed.length < 1 + 32 + 16) throw new Error('not a sealed key');
  const ephemeralPublic = sealed.slice(1, 33);
  const recipientPublic = new Uint8Array(await subtle().exportKey('raw', recipient.publicKey));
  const key = await sealKey(recipient.privateKey, ephemeralPublic, ephemeralPublic, recipientPublic, 'decrypt');
  return new Uint8Array(
    await subtle().decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(12), additionalData: agentKeyAad(walletId) as BufferSource },
      key,
      sealed.slice(33) as BufferSource,
    ),
  );
}

// ── Installing the wallet contract ───────────────────────────────────────────

/** The published build of the two-key wallet contract, by its code hash. */
export const WALLET_CONTRACT_CODE_HASH = '651XC7DH8J4Xczf8JKXH9pyveBY8ZuNCfy5HZ3SvuSiL';

/** What a new account for an agent is created with: its storage and a margin. */
export const AGENT_ACCOUNT_DEPOSIT_YOCTO = BigInt('500000000000000000000000'); // 0.5 NEAR

const INIT_GAS = BigInt('10000000000000');

/** A sub-account name: lowercase letters, digits and single `-` or `_` between them. */
export function isSubAccountName(name: string): boolean {
  return /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(name) && name.length >= 1;
}

/** The actions that put the wallet contract on the account that signs them. */
export function installActions(pair: string): Action[] {
  return [
    actionCreators.useGlobalContract(new GlobalContractIdentifier({ CodeHash: fromBase58(WALLET_CONTRACT_CODE_HASH) })),
    actionCreators.functionCall('w_init', { public_key: pair }, INIT_GAS, BigInt(1)),
  ];
}

/**
 * The owner's transaction that creates the agent's account: the account, its
 * NEAR, the owner's own key on it (so a failure after this leaves the account
 * in the owner's hands), and a key this page holds for the next step alone.
 */
export function createAccountActions(ownerPublicKey: string, pagePublicKey: string): Action[] {
  return [
    actionCreators.createAccount(),
    actionCreators.transfer(AGENT_ACCOUNT_DEPOSIT_YOCTO),
    actionCreators.addKey(PublicKey.fromString(ownerPublicKey), actionCreators.fullAccessKey()),
    actionCreators.addKey(PublicKey.fromString(pagePublicKey), actionCreators.fullAccessKey()),
  ];
}

/**
 * The agent account's own transaction: install the wallet contract, drop the
 * page's key, and, when the owner chose so, the owner's key too.
 */
export function installAndDropKeysActions(pair: string, pagePublicKey: string, ownerPublicKeyToRemove: string | null): Action[] {
  const drop = (key: string) => actionCreators.deleteKey(PublicKey.fromString(key));
  return [
    ...installActions(pair),
    ...(ownerPublicKeyToRemove ? [drop(ownerPublicKeyToRemove)] : []),
    drop(pagePublicKey),
  ];
}

/** A transaction of `signerId` signed with `key`, as the RPC takes it (base64). */
export async function signTransaction(
  key: KeyPair,
  signerId: string,
  receiverId: string,
  nonce: bigint,
  blockHash: Uint8Array,
  actions: Action[],
): Promise<string> {
  const transaction = createTransaction(signerId, key.getPublicKey(), receiverId, nonce, actions, blockHash);
  const encoded = encodeTransaction(transaction);
  const hash = new Uint8Array(await subtle().digest('SHA-256', encoded as BufferSource));
  const { signature } = key.sign(hash);
  const signed = new SignedTransaction({ transaction, signature: new Signature({ keyType: 0, data: signature }) });
  return toBase64(signed.encode());
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'wallet-contract', method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.data ? JSON.stringify(body.error.data) : body.error.message);
  return body.result as T;
}

/**
 * Send `actions` as a transaction of `accountId` to itself, signed with a key
 * this page holds. Resolves when the transaction is final; throws with the
 * chain's reason when it failed.
 */
export async function sendAsAccount(rpcUrl: string, accountId: string, key: KeyPair, actions: Action[]): Promise<string> {
  const accessKey = await rpc<{ nonce: number; block_hash: string }>(rpcUrl, 'query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: accountId,
    public_key: key.getPublicKey().toString(),
  });
  const signed = await signTransaction(key, accountId, accountId, BigInt(accessKey.nonce) + BigInt(1), fromBase58(accessKey.block_hash), actions);
  const outcome = await rpc<{ status?: { Failure?: unknown }; transaction: { hash: string } }>(
    rpcUrl,
    'broadcast_tx_commit',
    [signed],
  );
  if (outcome.status?.Failure) throw new Error(JSON.stringify(outcome.status.Failure));
  return outcome.transaction.hash;
}

/** What `w_public_key` of the account answers; `null` when it runs no wallet contract. */
export async function viewPair(rpcUrl: string, accountId: string): Promise<string | null> {
  try {
    const view = await rpc<{ result: number[] }>(rpcUrl, 'query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: accountId,
      method_name: 'w_public_key',
      args_base64: toBase64(utf8.encode('{}')),
    });
    const text = JSON.parse(new TextDecoder().decode(Uint8Array.from(view.result)));
    return typeof text === 'string' ? text : null;
  } catch {
    return null;
  }
}
