/**
 * What the owner's page does with a task, on WebCrypto alone.
 *
 * A task's content reaches this page as ciphertext, and so does the key it
 * is under: that key is encrypted to the public key of THIS device, whose
 * private half the page holds and cannot read — it is made non-extractable.
 * The other side of every function here is the worker's host
 * (`worker/src/tasks/crypto.rs` in the main repo), and the golden vectors in
 * `test/inbox-crypto.test.mjs` are the ones pinned there.
 *
 *   content          0x01 || nonce (12) || AES-256-GCM(content key, aad = task id)
 *   a file           the same, under the same key, aad = task id + ":file:" + its place
 *   to a public key  0x01 || ephemeral public key (65) || nonce (12) || AES-256-GCM
 *                    key = HKDF-SHA256(ikm = ECDH x, salt = ephemeral || recipient, info)
 *                    info = "outlayer-task:v1:" + purpose + ":" + task id
 *
 * The hash the owner's answer names is the SHA-256 of the bytes that were
 * opened: what is shown is what is hashed.
 */

const FORMAT = 0x01;
const POINT = 65;
const NONCE = 12;
const TAG = 16;
const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const;

/** What a blob encrypted to a public key is for. */
export type Purpose = 'device-copy' | 'answer' | 'rejection' | 'note';

/** A device: a key pair whose private half cannot be exported. */
export type Device = {
  privateKey: CryptoKey;
  /** The public key, as an uncompressed point. */
  point: Uint8Array;
  /** The public key as it is written: `p256:` and the point in base64url. */
  pubkey: string;
};

export type FieldKind = 'money' | 'account' | 'address' | 'text' | 'long_text' | 'list';

export type TaskField = {
  kind: FieldKind;
  label: string;
  values: string[];
  written_by: 'project' | 'agent';
};

/** What the envelope says of a file the owner is given to open. */
export type FileNote = {
  content_type: string;
  name: string;
  /** SHA-256 of the file's bytes, hex. */
  sha256: string;
  size: number;
};

/** What every envelope holds, whatever its kind. */
type EnvelopeOfAnyKind = {
  /** SHA-256 of the build that made the task, hex: the code the proof names, and the one that answers. */
  build: string;
  created_at: number;
  display: { title: string; fields: TaskField[] };
  expires_at: number;
  files: FileNote[];
  id: string;
  owner: string;
  policy_hash: string;
  preparer: string;
  profile: string;
  project: string;
  project_uuid: string;
  state_hash: string;
  thread: string;
  v: number;
};

/** A task the owner answers: it names the operation that carries the answer out, and the key the answer is sealed to. */
export type AskingEnvelope = EnvelopeOfAnyKind & {
  kind: 'confirm' | 'input';
  answer_by: { operation: string; supplies: 'nothing' | 'text' | 'file' };
  reply_pubkey: string;
};

/** A notice: it tells the owner something and asks nothing — no operation, no reply key. */
export type NoticeEnvelope = EnvelopeOfAnyKind & { kind: 'notice' };

/** A task's envelope: everything of a task but the project's own state. */
export type Envelope = AskingEnvelope | NoticeEnvelope;

const FIELD_KINDS: readonly string[] = ['money', 'account', 'address', 'text', 'long_text', 'list'];

function subtle(): SubtleCrypto {
  return globalThis.crypto.subtle;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(standard + '='.repeat((4 - (standard.length % 4)) % 4));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A public key as it is written. */
export function writePubkey(point: Uint8Array): string {
  return `p256:${toBase64Url(point)}`;
}

export function readPubkey(written: string): Uint8Array {
  if (!written.startsWith('p256:')) throw new Error('the key is not written `p256:…`');
  const point = fromBase64Url(written.slice(5));
  if (point.length !== POINT || point[0] !== 0x04) throw new Error('the key is not an uncompressed point of 65 bytes');
  return point;
}

export async function newDevice(): Promise<Device> {
  const pair = await subtle().generateKey(CURVE, false, ['deriveBits']);
  const point = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
  return { privateKey: pair.privateKey, point, pubkey: writePubkey(point) };
}

/** A moment in the sentences the wallet signs: to the second, in UTC. */
function moment(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The sentence the owner's wallet signs (NEP-413, recipient: the OutLayer contract). */
export function statement(account: string, devicePubkey: string, validUntil: number): string {
  return `Sign in to OutLayer as ${account}. Device key: ${devicePubkey}. Valid until ${moment(validUntil)}.`;
}

/**
 * What a session must not do alone, and what the owner's wallet signs for
 * it: withdrawing another device, naming or removing the webhook. A URL is
 * named by its SHA-256, so the wallet shows no address that may carry a
 * token.
 */
export type Confirmed = { withdraw_device: string } | { name_webhook: string } | { remove_webhook: true };

export async function confirmationAction(action: Confirmed): Promise<string> {
  if ('withdraw_device' in action) return `withdraw the device ${action.withdraw_device}`;
  if ('name_webhook' in action) {
    const digest = await subtle().digest('SHA-256', new TextEncoder().encode(action.name_webhook));
    return `name the webhook ${toHex(new Uint8Array(digest))}`;
  }
  return 'remove the webhook';
}

/** The sentence the owner's wallet signs to confirm one action, good for ten minutes. */
export async function confirmation(account: string, action: Confirmed, at: number): Promise<string> {
  return `Confirm in OutLayer as ${account}: ${await confirmationAction(action)}. At ${moment(at)}.`;
}

async function eciesKey(
  privateKey: CryptoKey,
  theirPoint: Uint8Array,
  ephemeralPoint: Uint8Array,
  recipientPoint: Uint8Array,
  purpose: Purpose,
  task: string,
  usage: 'encrypt' | 'decrypt',
): Promise<CryptoKey> {
  const theirs = await subtle().importKey('raw', theirPoint as BufferSource, CURVE, false, []);
  const shared = await subtle().deriveBits({ name: 'ECDH', public: theirs }, privateKey, 256);
  const ikm = await subtle().importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: concat(ephemeralPoint, recipientPoint) as BufferSource,
      info: utf8(`outlayer-task:v1:${purpose}:${task}`) as BufferSource,
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Open what was encrypted to this device for `purpose` of `task`. */
export async function openFrom(device: Device, purpose: Purpose, task: string, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.length < 1 + POINT + NONCE + TAG || blob[0] !== FORMAT) throw new Error('decryption failed');
  const ephemeral = blob.slice(1, 1 + POINT);
  const nonce = blob.slice(1 + POINT, 1 + POINT + NONCE);
  try {
    const key = await eciesKey(device.privateKey, ephemeral, ephemeral, device.point, purpose, task, 'decrypt');
    const opened = await subtle().decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      key,
      blob.slice(1 + POINT + NONCE) as BufferSource,
    );
    return new Uint8Array(opened);
  } catch {
    throw new Error('decryption failed');
  }
}

/** Encrypt `plaintext` to a public key for `purpose` of `task`. */
export async function sealTo(
  recipientPoint: Uint8Array,
  purpose: Purpose,
  task: string,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const ephemeral = await subtle().generateKey(CURVE, false, ['deriveBits']);
  const ephemeralPoint = new Uint8Array(await subtle().exportKey('raw', ephemeral.publicKey));
  const key = await eciesKey(ephemeral.privateKey, recipientPoint, ephemeralPoint, recipientPoint, purpose, task, 'encrypt');
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(NONCE));
  const sealed = await subtle().encrypt({ name: 'AES-GCM', iv: nonce as BufferSource }, key, plaintext as BufferSource);
  return concat(new Uint8Array([FORMAT]), ephemeralPoint, nonce, new Uint8Array(sealed));
}

async function openUnder(contentKey: Uint8Array, bound: string, blob: Uint8Array): Promise<Uint8Array> {
  if (blob.length < 1 + NONCE + TAG || blob[0] !== FORMAT) throw new Error('decryption failed');
  try {
    const key = await subtle().importKey('raw', contentKey as BufferSource, 'AES-GCM', false, ['decrypt']);
    const opened = await subtle().decrypt(
      { name: 'AES-GCM', iv: blob.slice(1, 1 + NONCE) as BufferSource, additionalData: utf8(bound) as BufferSource },
      key,
      blob.slice(1 + NONCE) as BufferSource,
    );
    return new Uint8Array(opened);
  } catch {
    throw new Error('decryption failed');
  }
}

/** The content of `task` under its content key: the envelope's document. */
export function openContent(contentKey: Uint8Array, task: string, blob: Uint8Array): Promise<Uint8Array> {
  return openUnder(contentKey, task, blob);
}

/**
 * The file at `at` of `task`, held to what the task's envelope says of it:
 * bytes of another size or another hash are not the task's file, and are not
 * handed over.
 */
export async function openFile(
  contentKey: Uint8Array,
  task: string,
  at: number,
  note: FileNote,
  blob: Uint8Array,
): Promise<Uint8Array> {
  const bytes = await openUnder(contentKey, `${task}:file:${at}`, blob);
  const hash = toHex(new Uint8Array(await subtle().digest('SHA-256', bytes as BufferSource)));
  if (bytes.length !== note.size || hash !== note.sha256) throw new Error('the file that opened is not the file the task names');
  return bytes;
}

/**
 * A name a browser may save a file under: what the task called it, without
 * anything that is a path. The owner's page never opens a file in itself; it
 * hands it over as a download.
 */
export function saveName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/^\.+/, '_').trim();
  return clean.slice(0, 200) || 'file';
}

const text = (v: unknown): v is string => typeof v === 'string';

/**
 * Is `value` an envelope, member for member? A document that is not one is
 * not drawn: the card draws what it knows, and guesses at nothing.
 */
export function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  const answerBy = e.answer_by as Record<string, unknown> | undefined;
  const display = e.display as Record<string, unknown> | undefined;
  if (typeof display !== 'object' || display === null) return false;
  // The kind and what it holds agree: a task that takes an answer names its
  // operation and its reply key, and a notice names neither — as the host
  // that wrote it holds them.
  const asking =
    (e.kind === 'confirm' || e.kind === 'input') &&
    typeof answerBy === 'object' &&
    answerBy !== null &&
    text(answerBy.operation) &&
    (answerBy.supplies === 'nothing' || answerBy.supplies === 'text' || answerBy.supplies === 'file') &&
    text(e.reply_pubkey);
  const notice = e.kind === 'notice' && !('answer_by' in e) && !('reply_pubkey' in e);
  const fields = display.fields;
  const wellFormedFields =
    Array.isArray(fields) &&
    fields.every((f) => {
      if (typeof f !== 'object' || f === null) return false;
      const field = f as Record<string, unknown>;
      return (
        text(field.label) &&
        text(field.kind) &&
        FIELD_KINDS.includes(field.kind) &&
        (field.written_by === 'project' || field.written_by === 'agent') &&
        Array.isArray(field.values) &&
        field.values.every(text)
      );
    });
  const files = e.files;
  const wellFormedFiles =
    Array.isArray(files) &&
    files.every((f) => {
      if (typeof f !== 'object' || f === null) return false;
      const file = f as Record<string, unknown>;
      return (
        text(file.name) &&
        text(file.content_type) &&
        text(file.sha256) &&
        /^[0-9a-f]{64}$/.test(file.sha256) &&
        typeof file.size === 'number' &&
        Number.isSafeInteger(file.size) &&
        file.size >= 0
      );
    });
  return (
    wellFormedFields &&
    wellFormedFiles &&
    text(display.title) &&
    (asking || notice) &&
    [e.id, e.owner, e.preparer, e.profile, e.project, e.project_uuid, e.thread].every(text) &&
    [e.policy_hash, e.state_hash].every(text) &&
    typeof e.build === 'string' &&
    /^[0-9a-f]{64}$/.test(e.build) &&
    typeof e.created_at === 'number' &&
    typeof e.expires_at === 'number' &&
    e.v === 1
  );
}

/** What the inbox lists of a task, as far as reading it goes. */
export type Listed = {
  id: string;
  project_id: string;
  preparer: string;
  content: string | null;
  device_copy: string | null;
};

export type Read = {
  envelope: Envelope;
  /** The envelope's document as it opened: the exact text whose UTF-8 bytes `hash` is of. */
  document: string;
  hash: string;
  /** The task's content key, in this page's memory only: what opens its files. */
  contentKey: Uint8Array;
};

/**
 * Read a task of the inbox in this browser. Throws when the task does not
 * open, or when what opened is not the task the inbox says it is — another
 * id, another owner, another project or another preparer than the row's.
 */
export async function readTask(device: Device, task: Listed, owner: string): Promise<Read> {
  if (task.device_copy === null || task.content === null) throw new Error('the task is locked in this browser');
  const contentKey = await openFrom(device, 'device-copy', task.id, fromBase64(task.device_copy));
  const document = await openContent(contentKey, task.id, fromBase64(task.content));
  let text: string;
  let envelope: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(document);
    envelope = JSON.parse(text);
  } catch {
    throw new Error('what opened is not a task');
  }
  if (!isEnvelope(envelope)) throw new Error('what opened is not a task');
  const same =
    envelope.id === task.id &&
    envelope.owner === owner &&
    envelope.project === task.project_id &&
    envelope.preparer === task.preparer;
  if (!same) throw new Error('the task that opened is not the task listed');
  const hash = toHex(new Uint8Array(await subtle().digest('SHA-256', document as BufferSource)));
  return { envelope, document: text, hash, contentKey };
}

/** What the owner supplies with an answer, the note beside an approval, or the reason of a rejection. */
export async function writeReply(envelope: AskingEnvelope, purpose: 'answer' | 'note' | 'rejection', words: string): Promise<Uint8Array> {
  return sealTo(readPubkey(envelope.reply_pubkey), purpose, envelope.id, utf8(words));
}

/**
 * Most bytes of a reason, of a note or of what the owner supplies, as UTF-8.
 * Sealed, each is held to the inbox API's bound of 8 KiB.
 */
export const MOST_REPLY_BYTES = 5000;

export function replyBytes(words: string): number {
  return utf8(words).length;
}
