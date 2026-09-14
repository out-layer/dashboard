// Grants on an access condition: read, add, revoke.
//
// The contract stores a condition tree; the interfaces read a whitelist entry
// as "this account was handed the secret". These three operations are what the
// secrets page and the access editor do to that tree, and each is a property a
// reviewer should not have to re-derive: a revoke never widens, a grant is
// idempotent, and an AllowAll row narrows to the owner before anyone is named.
//
// Run: npm test  (node's own runner, no dependencies)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  grantsOf,
  withGrant,
  withoutGrant,
  implicitAccountOf,
  nsToIsoUtc,
  localInputToNs,
  nsToLocalInput,
} from '../app/secrets/components/utils.ts';

const OWNER = 'me.near';
const AGENT = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER = 'other.near';
const T = '1760000000000000000';
const wl = (...accounts) => ({ Whitelist: { accounts } });
const and = (...conditions) => ({ Logic: { operator: 'And', conditions } });
const or = (...conditions) => ({ Logic: { operator: 'Or', conditions } });
const until = (ns) => ({ ValidUntil: { until_ns: ns } });

test('a whitelist names its grants; the owner is not a grant; a dated AND carries its limit', () => {
  assert.deepEqual(grantsOf(wl(OWNER, AGENT), OWNER), [{ account: AGENT, until_ns: null }]);
  assert.deepEqual(grantsOf(or(wl(OWNER), and(wl(AGENT), until(T))), OWNER), [{ account: AGENT, until_ns: T }]);
  assert.deepEqual(grantsOf('AllowAll', OWNER), []);
  // Under NOT a whitelist is a denylist: nobody was handed anything.
  assert.deepEqual(grantsOf({ Not: { condition: wl(AGENT) } }, OWNER), []);
  // The earliest limit above a leaf wins.
  assert.deepEqual(grantsOf(and(until('50'), and(wl(AGENT), until('99'))), OWNER), [{ account: AGENT, until_ns: '50' }]);
});

test('a grant without a date joins the open whitelist; with a date it becomes its own AND branch', () => {
  assert.deepEqual(withGrant(wl(OWNER), OWNER, AGENT, null), wl(OWNER, AGENT));
  assert.deepEqual(withGrant(wl(OWNER), OWNER, AGENT, T), or(wl(OWNER), and(wl(AGENT), until(T))));
  // Into an existing OR: undated joins the open branch, dated is appended.
  const tree = or(wl(OWNER), and(wl(AGENT), until(T)));
  assert.deepEqual(withGrant(tree, OWNER, OTHER, null), or(wl(OWNER, OTHER), and(wl(AGENT), until(T))));
  assert.deepEqual(withGrant(tree, OWNER, OTHER, T), or(wl(OWNER), and(wl(AGENT), until(T)), and(wl(OTHER), until(T))));
});

test('re-granting replaces the earlier grant instead of doubling it', () => {
  const once = withGrant(wl(OWNER), OWNER, AGENT, T);
  const twice = withGrant(once, OWNER, AGENT, '1790000000000000000');
  assert.deepEqual(grantsOf(twice, OWNER), [{ account: AGENT, until_ns: '1790000000000000000' }]);
  assert.deepEqual(withGrant(wl(OWNER, AGENT), OWNER, AGENT, null), wl(OWNER, AGENT));
});

test('a grant on an AllowAll row starts from the owner alone — it narrows, never leaves everyone in', () => {
  assert.deepEqual(withGrant('AllowAll', OWNER, AGENT, null), wl(OWNER, AGENT));
  assert.deepEqual(grantsOf(withGrant('AllowAll', OWNER, AGENT, T), OWNER), [{ account: AGENT, until_ns: T }]);
});

test('a revoke removes the account and prunes what that empties, and never widens', () => {
  assert.deepEqual(withoutGrant(wl(OWNER, AGENT), AGENT, OWNER), wl(OWNER));
  // The dated AND disappears with its only account; the OR collapses to its live branch.
  assert.deepEqual(withoutGrant(or(wl(OWNER), and(wl(AGENT), until(T))), AGENT, OWNER), wl(OWNER));
  // Another account in the same dated whitelist keeps its grant and its limit.
  assert.deepEqual(withoutGrant(and(wl(AGENT, OTHER), until(T)), AGENT, OWNER), and(wl(OTHER), until(T)));
  // Everything gone → the owner alone, not AllowAll.
  assert.deepEqual(withoutGrant(wl(AGENT), AGENT, OWNER), wl(OWNER));
  // Leaves this UI does not write are left untouched.
  const nft = { NftOwned: { contract: 'x.near', token_id: null } };
  assert.deepEqual(withoutGrant(or(nft, wl(AGENT)), AGENT, OWNER), nft);
  assert.deepEqual(withoutGrant('AllowAll', AGENT, OWNER), 'AllowAll');
});

test('a wallet public key becomes the implicit account that pays for its calls', () => {
  assert.equal(implicitAccountOf('ed25519:BtCjvJYNeN8RoVze7WTsgxfwT1KQR17rbQ5NLUevRxsH'), AGENT);
  // Leading '1's are leading zero bytes.
  assert.equal(
    implicitAccountOf('ed25519:11tJ93RwaVfE1PEMxd5rpZZuPtLCwbEaDCrNBhAy8Cv'),
    '0000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  );
  assert.equal(implicitAccountOf('secp256k1:abc'), null);
  assert.equal(implicitAccountOf('ed25519:0OIl'), null, 'not base58');
  assert.equal(implicitAccountOf('ed25519:abc'), null, 'not 32 bytes');
});

// ── The time a grant lapses at, read and written in ONE zone ────────────────
//
// The widget is labelled UTC and the contract stores nanoseconds since the
// epoch. Everything between the two has to agree on that, because nothing about
// a wrong answer looks wrong: a grant silently shifted by the viewer's offset
// still renders, still saves, and lapses at the wrong moment.

test('a typed date is read as UTC, not as the viewer\'s local time', () => {
  // The property, independent of the machine this runs on: the same wall clock
  // with and without the Z means the same instant. Drop the Z that
  // `localInputToNs` appends and these diverge by the viewer's offset on every
  // machine that is not at UTC.
  assert.equal(localInputToNs('2026-10-01T00:00:00'), localInputToNs('2026-10-01T00:00:00Z'));
  // And the instant itself. The same number the CLI writes for this date, so a
  // grant made in the dashboard and one made with `--access` are the same grant.
  assert.equal(localInputToNs('2026-10-01T00:00:00'), '1790812800000000000');
  assert.equal(localInputToNs('1970-01-01T00:00:00'), '0');
});

test('an unreadable date is refused rather than guessed at', () => {
  for (const bad of ['', 'not a date', '2026-13-01T00:00:00', '1969-12-31T23:59:59']) {
    assert.equal(localInputToNs(bad), null, bad);
  }
});

test('nanoseconds render as a UTC instant a person can read', () => {
  // The same instant the keystore's own tests use, so both sides agree by eye.
  assert.equal(nsToIsoUtc('1760000000000000000'), '2025-10-09T08:53:20Z');
  assert.equal(nsToIsoUtc('0'), '1970-01-01T00:00:00Z');
  assert.equal(nsToIsoUtc('1790812800000000000'), '2026-10-01T00:00:00Z');
  // The largest a u64 of nanoseconds reaches is year 2554, which is a real date
  // and renders as one — there is no overflow to guard against.
  assert.equal(nsToIsoUtc('18446744073709551615'), '2554-07-21T23:34:33Z');
  // Unreadable input comes back as it is: a row stored by hand must still show.
  assert.equal(nsToIsoUtc('soon'), 'soon');
});

test('the widget round-trips: what it shows is what it saves', () => {
  for (const typed of ['2026-10-01T00:00:00', '2025-10-09T08:53:20', '1970-01-01T00:00:00']) {
    assert.equal(nsToLocalInput(localInputToNs(typed)), typed);
  }
  assert.equal(nsToLocalInput('soon'), '');
});
