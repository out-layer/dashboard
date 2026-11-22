// A delete, close or refund claim of a payment key is judged from the chain once its block is
// final, not from the first read after the wallet returns: the wallet answers a few blocks
// before the block is final, and the site reads at final finality.
//
// The logic is run; the page is held to its shape as text.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CLAIM_COOLDOWN_MS,
  LANDING_READS,
  LANDING_READ_MS,
  claimShows,
  closeShows,
  deleteShows,
  failureOf,
  keyListed,
  untilShown,
} from '../lib/payment-key-landing.ts';

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), 'utf8');
/** The source without its comments. */
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\/|(?<![:'"`\w\\/])\/\/.*$/gm, '');
const PAGE = code('app/payment-keys/page.tsx');
const LIB = code('lib/payment-key-landing.ts');

/** A chain that shows `before` to the first `stale` reads and `after` from then on. */
function chain(before, after, stale) {
  let reads = 0;
  return {
    read: async () => (reads++ < stale ? before : after),
    reads: () => reads,
  };
}
const pauses = () => {
  const waited = [];
  return { pause: async (ms) => void waited.push(ms), waited };
};

test('a change is looked for until its block is final, a bounded number of times', async () => {
  const c = chain({ listed: true }, { listed: false }, 2);
  const p = pauses();
  const landed = await untilShown({ read: c.read, shows: deleteShows, current: () => true, pause: p.pause });
  assert.deepEqual(landed, { kind: 'shown', state: { listed: false } });
  assert.equal(c.reads(), 3, 'the first reads see the key as it was before the delete');
  assert.deepEqual(p.waited, [LANDING_READ_MS, LANDING_READ_MS]);

  const never = chain({ listed: true }, { listed: true }, 0);
  const q = pauses();
  assert.deepEqual(await untilShown({ read: never.read, shows: deleteShows, current: () => true, pause: q.pause }), {
    kind: 'not_shown',
    state: { listed: true },
  });
  assert.equal(never.reads(), LANDING_READS + 1);
});

test('a read that fails is a read to make again, never a failed transaction', async () => {
  let n = 0;
  const flaky = async () => {
    n += 1;
    if (n === 1) throw new Error('429');
    return { ledger: { closing_since: 5 } };
  };
  const landed = await untilShown({ read: flaky, shows: closeShows, current: () => true, pause: async () => {} });
  assert.equal(landed.kind, 'shown');

  const down = async () => {
    throw new Error('rpc down');
  };
  const unread = await untilShown({ read: down, shows: closeShows, current: () => true, pause: async () => {} });
  assert.equal(unread.kind, 'unread');
  assert.equal(unread.error.message, 'rpc down');
});

test('nothing read for one account is shown once another one connected', async () => {
  let connected = 'alice.near';
  const c = chain({ listed: true }, { listed: false }, 2);
  const read = async () => {
    const state = await c.read();
    connected = 'bob.near';
    return state;
  };
  const landed = await untilShown({
    read,
    shows: deleteShows,
    current: () => connected === 'alice.near',
    pause: async () => {},
  });
  assert.deepEqual(landed, { kind: 'left' });
  assert.equal(c.reads(), 1, 'the reads stop once the account changed');
});

test('a delete shows only once the key is gone', () => {
  assert.equal(deleteShows({ listed: true }), false);
  assert.equal(deleteShows({ listed: false }), true);
});

test('a close shows only once the key is closing', () => {
  assert.equal(closeShows({ ledger: null }), false, 'a key with no ledger yet');
  assert.equal(closeShows({ ledger: { closing_since: null } }), false);
  assert.equal(closeShows({ ledger: { closing_since: 1_700_000_000_000_000_000 } }), true);
});

test("a refund claim shows only once this claim's answer is on chain", () => {
  const sentAt = Date.UTC(2026, 10, 22, 12);
  const ns = (ms) => ms * 1_000_000;
  const flight = (lastClaimMs, open) => ({
    top_ups_in_flight: 0,
    last_top_up_height: 0,
    close_pending: false,
    claim_open: open,
    last_claim_at: ns(lastClaimMs),
    next_claim_at: ns(lastClaimMs + CLAIM_COOLDOWN_MS),
  });
  const shows = claimShows(sentAt);
  // Before the claim's block is final: no claim yet, or the one a day or more before.
  assert.equal(shows({ listed: true, flight: null }), false);
  assert.equal(shows({ listed: true, flight: flight(0, false) }), false);
  assert.equal(shows({ listed: true, flight: flight(sentAt - CLAIM_COOLDOWN_MS - 60_000, false) }), false);
  // The claim is in, its answer is not.
  assert.equal(shows({ listed: true, flight: flight(sentAt + 2_000, true) }), false);
  // Answered with a refusal: the key stays closing, the claim is closed.
  assert.equal(shows({ listed: true, flight: flight(sentAt + 2_000, false) }), true);
  // A browser clock hours off still tells this claim from the one before.
  assert.equal(shows({ listed: true, flight: flight(sentAt - 6 * 3600_000, false) }), true);
  // Answered with a quote: the key is gone.
  assert.equal(shows({ listed: false, flight: null }), true);
});

test('a payment key is found in the list by its nonce', () => {
  const secrets = [
    { accessor: { System: 'PaymentKey' }, profile: '3' },
    { accessor: { Project: { project_id: 'a/b' } }, profile: '7' },
  ];
  assert.equal(keyListed(secrets, 3), true);
  assert.equal(keyListed(secrets, 7), false, 'a secret of another accessor with the same profile');
  assert.equal(keyListed([], 3), false);
});

test("a wallet's failed outcome is read as the failure it is", () => {
  assert.equal(failureOf(undefined), null);
  assert.equal(failureOf({ status: { SuccessValue: '' } }), null);
  assert.equal(failureOf({ status: { Failure: 'nope' } }), 'nope');
  assert.match(failureOf({ status: { Failure: { ActionError: { index: 0 } } } }), /ActionError/);
});

test('the library opens no wallet', () => {
  for (const opens of ['signAndSendTransaction', 'signMessage', 'useNearWallet']) {
    assert.ok(!LIB.includes(opens), `lib/payment-key-landing.ts names ${opens}`);
  }
});

/** The body of `const <name> = useCallback(` up to the next `const handle`/`return (`. */
function handler(name) {
  const at = PAGE.indexOf(`const ${name} = useCallback(`);
  assert.ok(at !== -1, `${name} is gone`);
  const ends = [PAGE.indexOf('const handle', at + 1), PAGE.indexOf('  return (\n', at)].filter((i) => i !== -1);
  return PAGE.slice(at, Math.min(...ends));
}

test('delete, close and claim are judged from the chain after their send, not from one read', () => {
  for (const [name, shows] of [
    ['handleDeleteKey', 'deleteShows'],
    ['handleCloseKey', 'closeShows'],
    ['handleClaimRefund', 'claimShows(sentAt)'],
  ]) {
    const body = handler(name);
    const sent = body.indexOf('await signAndSendTransaction(');
    const failed = body.indexOf('failureOf(');
    const looked = body.indexOf('await afterSent(');
    const judged = body.indexOf(shows);
    assert.ok(sent !== -1 && sent < failed && failed < looked && looked < judged, `${name}: the outcome is not read from the chain after the send`);
    assert.ok(!body.includes('loadPaymentKeys()'), `${name}: the keys are read once, straight after the send`);
    assert.equal(body.match(/signAndSendTransaction\(/g)?.length, 1, `${name}: the wallet is asked more than once`);
    // What the page says is decided after the reads, never before them.
    const said = Math.min(...['setSuccess(', 'setError(']
      .map((s) => body.indexOf(s, looked))
      .filter((i) => i !== -1));
    assert.ok(body.slice(0, looked).match(/setSuccess\(/g) === null, `${name}: a success said before the chain shows it`);
    assert.ok(said > looked, `${name}: nothing is said after the reads`);
  }
  // The reads end in one place, which refreshes the keys and drops what belongs to an
  // account that is no longer connected.
  const after = PAGE.slice(PAGE.indexOf('const afterSent = useCallback('), PAGE.indexOf('const handleDeleteKey'));
  assert.match(after, /current: \(\) => accountNow\.current === sentBy/);
  assert.ok(after.indexOf("if (landed.kind === 'left') return null;") < after.indexOf('loadPaymentKeys()'));
  assert.ok(!after.includes('signAndSendTransaction'), 'the wallet is reached from the reads');
});
