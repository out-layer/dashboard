// The sealed answer a connector returns on chain opens here, and nowhere else.
//
// The golden blob was produced by the Gmail connector's Rust sealer
// (`connectors/gmail-connector/src/seal.rs`, `print_a_fresh_golden_vector`,
// the `ecies` crate) for the secp256k1 secret key 01 02 … 20. The Rust test
// opens the same bytes with the same crate; here `eciesjs` opens them. If
// either side changes its format, one of the two goes red. Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, PrivateKey } from 'eciesjs';
import { generateReplyKeypair, openReply, hexToBytes, bytesToHex } from '../lib/ecies.ts';

const SECRET = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const GOLDEN_PUBKEY = '0284bf7562262bbd6940085748f3be6afa52ae317155181ece31b66351ccffa4b0';
const GOLDEN_PLAINTEXT = '{"present":true,"recipient_domains":["example.com"],"max_per_day":20}';
const GOLDEN_BLOB =
  '0492378401b0aa5cc254daf633fe5d683a037f61ef03c1f2e6d45cc356e0e451183fbce77e9c469abb97bf04e1434caad989d4098ecaeb4da1356d7da0a76c4c5684185c155e8161102168242adebddb0e727580285dee0f6fa2aeb4b16a8fcac03b911e61dd5a6ea0bd193ab78fd168016b419fe090a42f7d0843ae62086d6f7171cd70aab94d8d221e06b608a1a8390e794194f67a4aac6ed14137e8c436962366894fb7ae';

test('the secret the Rust side used derives the public key it sealed to', () => {
  assert.equal(new PrivateKey(SECRET).publicKey.toHex(), GOLDEN_PUBKEY);
});

test('the blob the Rust sealer made opens here with the same key', () => {
  const opened = openReply(SECRET, hexToBytes(GOLDEN_BLOB));
  assert.equal(new TextDecoder().decode(opened), GOLDEN_PLAINTEXT);
});

test('a wrong key, a changed byte or a truncated blob do not open', () => {
  const wrong = Uint8Array.from(SECRET, (b) => b ^ 1);
  assert.throws(() => openReply(wrong, hexToBytes(GOLDEN_BLOB)), /did not open/);
  const tampered = hexToBytes(GOLDEN_BLOB);
  tampered[tampered.length - 1] ^= 1;
  assert.throws(() => openReply(SECRET, tampered), /did not open/);
  assert.throws(() => openReply(SECRET, hexToBytes(GOLDEN_BLOB).subarray(0, 70)), /did not open/);
});

test('a reply keypair from this page is what the connector expects, and round-trips', () => {
  const { publicKeyHex, secretKey } = generateReplyKeypair();
  assert.equal(publicKeyHex.length, 66, '33 bytes compressed, as the connector parses it');
  assert.match(publicKeyHex, /^0[23]/);
  assert.equal(bytesToHex(new PrivateKey(secretKey).publicKey.toBytes()), publicKeyHex);
  const sealed = encrypt(publicKeyHex, new TextEncoder().encode('{"present":false}'));
  assert.equal(new TextDecoder().decode(openReply(secretKey, sealed)), '{"present":false}');
  // Two answers to one key never share bytes: fresh ephemeral key and nonce.
  assert.notDeepEqual(sealed, encrypt(publicKeyHex, new TextEncoder().encode('{"present":false}')));
});
