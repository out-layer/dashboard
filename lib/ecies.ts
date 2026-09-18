import { ChaCha20Poly1305 } from '@stablelib/chacha20poly1305';
import { randomBytes } from '@stablelib/random';
import { generateKeyPair, sharedKey } from '@stablelib/x25519';
import { HKDF } from '@stablelib/hkdf';
import { SHA256 } from '@stablelib/sha256';
import { PrivateKey, decrypt as eciesjsDecrypt } from 'eciesjs';

/**
 * Two directions, two constructions, kept apart on purpose.
 *
 * Browser → enclave (`eciesEncrypt`): the keystore's own ECIES, X25519 + HKDF +
 * ChaCha20-Poly1305, which the keystore implements and opens.
 *
 * Enclave → browser (`generateReplyKeypair`, `openReply`): the pair near.email
 * runs on — the `ecies` crate in the guest, `eciesjs` here — secp256k1 ECDH +
 * HKDF-SHA256 + AES-256-GCM, in a format the two libraries keep compatible with
 * each other. A connector seals an answer to a key made here, for a run whose
 * output lands on chain where anyone could read it.
 */

const HKDF_INFO = new TextEncoder().encode('outlayer-keystore-v1');
const ECIES_VERSION = 0x01;

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/, '');
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error(`Not hex: ${clean.length} characters`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * ECIES encrypt for the keystore: X25519 ECDH + HKDF-SHA256 + ChaCha20-Poly1305
 *
 * Format: [0x01 | ephemeral_x25519_pubkey(32) | nonce(12) | ciphertext | tag(16)]
 */
export function eciesEncrypt(pubkeyHex: string, plaintext: Uint8Array): Uint8Array {
  const recipientPub = hexToBytes(pubkeyHex);
  if (recipientPub.length !== 32) {
    throw new Error(`Invalid public key length: ${recipientPub.length}, expected 32`);
  }
  const ephemeral = generateKeyPair();
  const shared = sharedKey(ephemeral.secretKey, recipientPub);
  const derived = new HKDF(SHA256, shared, undefined, HKDF_INFO).expand(32);
  const cipher = new ChaCha20Poly1305(derived);
  const nonce = randomBytes(12);
  const ciphertextWithTag = cipher.seal(nonce, plaintext);
  const result = new Uint8Array(1 + 32 + 12 + ciphertextWithTag.length);
  result[0] = ECIES_VERSION;
  result.set(ephemeral.publicKey, 1);
  result.set(nonce, 33);
  result.set(ciphertextWithTag, 45);
  return result;
}

/**
 * A key for one answer. The secret half lives in the calling page's memory (or
 * its tab's session, for the length of a wallet round trip) and nowhere else;
 * the public half — 33 bytes compressed, the form `eciesjs` gives — goes into
 * the request as `reply_pubkey`.
 */
export function generateReplyKeypair(): { publicKeyHex: string; secretKey: Uint8Array } {
  const key = new PrivateKey();
  return { publicKeyHex: key.publicKey.toHex(), secretKey: key.secret };
}

/**
 * Open an answer a connector sealed to a reply key. Throws on a blob sealed to
 * another key, a truncated one, or a changed byte — the tag check catches every
 * one of those the same way, and there is nothing useful to say beyond "this
 * did not open".
 */
export function openReply(secretKey: Uint8Array, blob: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(eciesjsDecrypt(secretKey, blob));
  } catch {
    throw new Error('The sealed answer did not open with the key this page holds.');
  }
}
