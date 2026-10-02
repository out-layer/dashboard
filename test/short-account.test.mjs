import assert from 'node:assert/strict';
import test from 'node:test';
import { implicitAccountOf, isImplicitAccount, shortAccount } from '../lib/short-account.ts';

// Base58 written by the suite's encoder (`tests/lib/tasks_page.mjs` of the
// main repo), not by the decoder under test.
test('an ed25519 key is its implicit account: the hex of its 32 bytes', () => {
  for (const [key, hex] of [
    ['1thX6LZfHDZZKUs92febYZhYRcXddmzfzF2NvTkPNE', '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'],
    ['11111111111111111111111111111112', '0000000000000000000000000000000000000000000000000000000000000001'],
    ['JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'],
  ]) {
    assert.equal(implicitAccountOf(`ed25519:${key}`), hex, key);
    assert.ok(isImplicitAccount(hex));
  }
  assert.equal(shortAccount('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'), '0001020…c1d1e1f');
});

test('anything that is not an ed25519 key of 32 bytes has no implicit account', () => {
  for (const key of ['secp256k1:1thX6LZfHDZZKUs92febYZhYRcXddmzfzF2NvTkPNE', '1thX6LZfHDZZKUs92febYZhYRcXddmzfzF2NvTkPNE', 'ed25519:0OIl', 'ed25519:', 'ed25519:111', 'ed25519:JEKNVnkbo3jma5nREBBJCDoXFVeKkD56V3xKrvRmWxFG1']) {
    assert.equal(implicitAccountOf(key), null, key);
  }
});
