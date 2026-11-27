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
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
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

/**
 * The actions that put the wallet contract on the account that signs them.
 * `w_init` takes its caller for the account itself and a deposit, so it is
 * signed by a full-access key of that account: the owner's wallet for the
 * owner's own account, the page's one-time key for a new one.
 */
export function installActions(pair: string): Action[] {
  return [
    actionCreators.useGlobalContract(new GlobalContractIdentifier({ CodeHash: fromBase58(WALLET_CONTRACT_CODE_HASH) })),
    actionCreators.functionCall('w_init', { public_key: pair }, INIT_GAS, BigInt(1)),
  ];
}

/**
 * The owner's transaction that creates the agent's account: the account, its
 * NEAR, a key this page holds for the installing transaction alone, and the
 * owner's own key, so that a tab lost before the install leaves the account in
 * the owner's hands. The install removes both.
 */
export function createAccountActions(pagePublicKey: string, ownerPublicKey: string | null): Action[] {
  return [
    actionCreators.createAccount(),
    actionCreators.transfer(AGENT_ACCOUNT_DEPOSIT_YOCTO),
    actionCreators.addKey(PublicKey.fromString(pagePublicKey), actionCreators.fullAccessKey()),
    ...(ownerPublicKey ? [actionCreators.addKey(PublicKey.fromString(ownerPublicKey), actionCreators.fullAccessKey())] : []),
  ];
}

/**
 * The new account's own transaction, signed by the page's key: install the
 * wallet contract and drop the owner's key and the page's. The account is left
 * with no key.
 */
export function installAndDropKeyActions(pair: string, pagePublicKey: string, ownerPublicKey: string | null): Action[] {
  return [
    ...installActions(pair),
    ...(ownerPublicKey ? [actionCreators.deleteKey(PublicKey.fromString(ownerPublicKey))] : []),
    actionCreators.deleteKey(PublicKey.fromString(pagePublicKey)),
  ];
}

// ── A wallet contract at its deterministic address (NEP-616) ────────────────
//
// The address is "0s" + hex(keccak256(borsh(StateInit))[12..32]); the
// StateInit names the build by its code hash and holds the contract's first
// state, `State::new(pair)`. Held to custody-core's vectors/deterministic.json.

/** The two-key contract's default timeout (`State::new`), in seconds. */
const CONTRACT_DEFAULT_TIMEOUT_SECS = 3600;

function u32le(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}

function u64le(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

function u128le(n: bigint): Uint8Array {
  return concat(u64le(n & BigInt('0xffffffffffffffff')), u64le(n >> BigInt(64)));
}

function borshString(text: string): Uint8Array {
  const bytes = utf8.encode(text);
  return concat(u32le(bytes.length), bytes);
}

/** The Borsh of the two-key contract's `State::new(pair)`; `pair` is the 128-hex text form. */
export function stateBytes(pair: string): Uint8Array {
  const keys = fromHex(pair, 64);
  return concat(
    Uint8Array.of(1), // signatures on
    u32le(0), // subwallet id
    keys,
    u32le(CONTRACT_DEFAULT_TIMEOUT_SECS),
    u64le(BigInt(0)), // last_cleaned_at
    u32le(0), // old nonces: none
    u32le(0), // current nonces: none
    u32le(0), // extensions: none
  );
}

/** The Borsh of `StateInit::V1 { code: CodeHash(build), data: { "": state } }`. */
export function stateInitBytes(pair: string, codeHash: string = WALLET_CONTRACT_CODE_HASH): Uint8Array {
  const state = stateBytes(pair);
  return concat(Uint8Array.of(0, 0), fromBase58(codeHash), u32le(1), u32le(0), u32le(state.length), state);
}

/** The `0s` account of a fresh wallet contract of `pair`. */
export function deterministicAccount(pair: string, codeHash: string = WALLET_CONTRACT_CODE_HASH): string {
  return `0s${toHex(keccak_256(stateInitBytes(pair, codeHash)).slice(12))}`;
}

/**
 * What the owner sends the page's one-time key for its two transactions' gas.
 * Creating the contract costs about 0.0074 NEAR (its storage is paid in gas
 * within the zero-balance limit); what is left goes back to the owner.
 */
export const PAGE_KEY_FUNDING_YOCTO = BigInt('20000000000000000000000'); // 0.02 NEAR

/** The NEAR implicit account of an Ed25519 key: its public key in hex. */
export function implicitAccountOf(key: KeyPair): string {
  return toHex(key.getPublicKey().data);
}

/** The owner's transaction: NEAR for the page's one-time key, an ordinary transfer. */
export function fundPageKeyActions(): Action[] {
  return [actionCreators.transfer(PAGE_KEY_FUNDING_YOCTO)];
}

/**
 * A transaction with one `DeterministicStateInit` action (NEP-616, action 11),
 * signed with `key`, as the RPC takes it (base64). Written out by hand: the
 * transaction library does not encode this action. The frame is the library's
 * own (held by a test against `encodeTransaction`).
 */
export function signStateInitTransaction(
  key: KeyPair,
  signerId: string,
  nonce: bigint,
  blockHash: Uint8Array,
  pair: string,
): string {
  const receiverId = deterministicAccount(pair);
  const transaction = concat(
    borshString(signerId),
    Uint8Array.of(0),
    key.getPublicKey().data,
    u64le(nonce),
    borshString(receiverId),
    blockHash,
    u32le(1),
    Uint8Array.of(11),
    stateInitBytes(pair),
    u128le(BigInt(0)), // no deposit: the state fits the zero-balance limit
  );
  const { signature } = key.sign(sha256(transaction));
  return toBase64(concat(transaction, Uint8Array.of(0), signature));
}

/** The frame of a transaction as `signStateInitTransaction` writes it, with any action bytes. */
export function transactionFrame(
  publicKey: Uint8Array,
  signerId: string,
  receiverId: string,
  nonce: bigint,
  blockHash: Uint8Array,
  action: Uint8Array,
): Uint8Array {
  return concat(borshString(signerId), Uint8Array.of(0), publicKey, u64le(nonce), borshString(receiverId), blockHash, u32le(1), action);
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
  const outcome = await sendFinal(rpcUrl, signed);
  if (outcome.status?.Failure) throw new Error(JSON.stringify(outcome.status.Failure));
  return outcome.transaction.hash;
}

/** What `w_public_key` of the account answers; `null` when it runs no wallet contract. */
/**
 * The pair `accountId`'s wallet contract answers, or `null` when the account
 * has no such contract (or does not exist). A failure to ask is thrown, so it is
 * never read as "no contract".
 */
export async function viewPair(rpcUrl: string, accountId: string): Promise<string | null> {
  let view: { result?: number[]; error?: string };
  try {
    view = await rpc<{ result?: number[]; error?: string }>(rpcUrl, 'query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: accountId,
      method_name: 'w_public_key',
      args_base64: toBase64(utf8.encode('{}')),
    });
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    if (/UNKNOWN_ACCOUNT|does not exist|CodeDoesNotExist|MethodNotFound|NO_CONTRACT_CODE|wasm execution failed/.test(said)) return null;
    throw e;
  }
  if (!view.result) return null;
  const text = JSON.parse(new TextDecoder().decode(Uint8Array.from(view.result)));
  return typeof text === 'string' ? text : null;
}

/** Send a signed transaction and wait until it is final, so a read at `final` sees it. */
async function sendFinal(rpcUrl: string, signed: string): Promise<{ status?: { Failure?: unknown }; transaction: { hash: string } }> {
  return rpc(rpcUrl, 'send_tx', { signed_tx_base64: signed, wait_until: 'FINAL' });
}

/** Whether `accountId` exists. */
export async function accountExists(rpcUrl: string, accountId: string): Promise<boolean> {
  try {
    await rpc(rpcUrl, 'query', { request_type: 'view_account', finality: 'final', account_id: accountId });
    return true;
  } catch {
    return false;
  }
}

/** Whether `publicKey` is an access key of `accountId`. */
export async function hasAccessKey(rpcUrl: string, accountId: string, publicKey: string): Promise<boolean> {
  try {
    await rpc(rpcUrl, 'query', { request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey });
    return true;
  } catch {
    return false;
  }
}

/** Whether `publicKey` is a full-access key of `accountId` (a function-call key is not). */
export async function isFullAccessKey(rpcUrl: string, accountId: string, publicKey: string): Promise<boolean> {
  try {
    const key = await rpc<{ permission?: unknown }>(rpcUrl, 'query', {
      request_type: 'view_access_key',
      finality: 'final',
      account_id: accountId,
      public_key: publicKey,
    });
    return key.permission === 'FullAccess';
  } catch {
    return false;
  }
}

/** The one-time key's account was closed with no contract made: a new key is funded next time. */
export class PageKeyClosed extends Error {}

/**
 * Close the one-time key's account to the owner, when it still exists: what is
 * left of the owner's NEAR goes back. Returns whether the account is gone.
 */
export async function closePageKey(rpcUrl: string, key: KeyPair, owner: string): Promise<boolean> {
  const signerId = implicitAccountOf(key);
  if (!(await accountExists(rpcUrl, signerId))) return true;
  const accessKey = await rpc<{ nonce: number; block_hash: string }>(rpcUrl, 'query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: signerId,
    public_key: key.getPublicKey().toString(),
  });
  await sendFinal(
    rpcUrl,
    await signTransaction(key, signerId, signerId, BigInt(accessKey.nonce) + BigInt(1), fromBase58(accessKey.block_hash), [
      actionCreators.deleteAccount(owner),
    ]),
  ).catch(() => undefined);
  return !(await accountExists(rpcUrl, signerId));
}

/**
 * With the page's one-time key, funded by the owner: create the `0s` wallet
 * contract of `pair` by `StateInit`, then delete the key's own account with the
 * owner as beneficiary, so what is left of the funding goes back.
 */
export async function createDeterministicAccount(rpcUrl: string, key: KeyPair, owner: string, pair: string): Promise<string> {
  const signerId = implicitAccountOf(key);
  const accessKey = await rpc<{ nonce: number; block_hash: string }>(rpcUrl, 'query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: signerId,
    public_key: key.getPublicKey().toString(),
  });
  // Both transactions from one read of the key: the second takes the next
  // nonce, since a read made right after the first may not show it yet.
  const nonce = BigInt(accessKey.nonce) + BigInt(1);
  const blockHash = fromBase58(accessKey.block_hash);
  // The key's account is closed to the owner whether or not the contract was
  // created, so what the owner sent comes back either way.
  const account = deterministicAccount(pair);
  const close = async () => {
    const closed = await sendFinal(
      rpcUrl,
      await signTransaction(key, signerId, signerId, nonce + BigInt(1), blockHash, [actionCreators.deleteAccount(owner)]),
    );
    if (closed.status?.Failure) throw new Error(JSON.stringify(closed.status.Failure));
  };
  let failure: string | null = null;
  try {
    const created = await sendFinal(rpcUrl, signStateInitTransaction(key, signerId, nonce, blockHash, pair));
    if (created.status?.Failure) failure = JSON.stringify(created.status.Failure);
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  await close().catch(() => undefined);
  // What counts is the chain: a StateInit whose answer was lost may have landed,
  // and a close whose answer was lost may have gone through.
  const made = (await viewPair(rpcUrl, account)) === pair;
  const closed = !(await accountExists(rpcUrl, signerId));
  if (made) {
    if (!closed) await closePageKey(rpcUrl, key, owner);
    return account;
  }
  const why = `The wallet contract was not created${failure ? ` (${failure})` : ''}.`;
  if (closed) throw new PageKeyClosed(`${why} The NEAR came back to you; press the button again.`);
  throw new Error(`${why} Press the button again: the same one-time key is used.`);
}

/** The wallet contract a wallet has already, as the setup reports it. */
export interface CurrentContract {
  account_id: string;
  /** The agent's Ed25519 public key in the contract's pair, in hex. */
  agent_public_key: string;
}

/**
 * Why a signature cannot hand over the agent's key of a wallet that has a
 * wallet contract, or `null` when it can. The agent's key follows from the key
 * that signed, so a signature of another key makes another agent key: the page
 * stops there instead of installing a second contract the first one's funds do
 * not follow. Nothing about the earlier signature is kept: the contract's own
 * key is what the new one is held to.
 */
export function otherKeyRefusal(
  current: CurrentContract | null,
  agentPublicKeyHex: string,
  owner: string,
  signedWith: string,
): string | null {
  if (!current || current.agent_public_key === agentPublicKeyHex) return null;
  return (
    `This wallet's agent key was made with another key of ${owner}: the key ${signedWith} makes a different one. ` +
    `Sign again with the full-access key you used when you set this wallet up. ` +
    `Nothing was sent: the wallet contract ${current.account_id} and its funds stay as they are.`
  );
}

/**
 * Whether a setup can name `account` for `owner`'s wallet: the owner's own
 * account, a sub-account of it, or a `0s` address (which the coordinator holds
 * to the wallet's pair and an approved build). An account the agent named
 * itself (`PUT /wallet/v1/contract`) is none of these, and its key is handed
 * over by no setup.
 */
export function setupCanName(account: string, owner: string): boolean {
  return account === owner || account.endsWith(`.${owner}`) || /^0s[0-9a-f]{40}$/.test(account);
}
