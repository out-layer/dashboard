// The browser-side check an approver's signature waits on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkOpAgainstHash } from '../lib/approval-hash.ts';

// The same pair is pinned in shared-tee-helpers
// (`the_hash_an_approver_signs_is_pinned_to_a_vector_the_dashboard_shares`):
// the keystore's canonical form and hash, byte for byte.
const CANONICAL =
  '{"amount":"5","kind":"limit_order","min_amount_out":"1","to":"me","to_type":"intents","token":"nep141:wrap.near","token_out":"nep141:usdc.near"}';
const HASH = '78e16d304ba33901ea4a41eef1abd675e8a9d33ae0edb489e90158ffa9ad5491';

test('the operation shown is the operation signed', async () => {
  const r = await checkOpAgainstHash(CANONICAL, HASH);
  assert.equal(r.status, 'match');
  assert.equal(r.op.to, 'me');
  assert.equal(r.op.amount, '5');
  // Hex case is not a difference.
  assert.equal((await checkOpAgainstHash(CANONICAL, HASH.toUpperCase())).status, 'match');
});

test('a hash that belongs to another operation is caught before anyone signs', async () => {
  // The substitution this exists for: same hash, a different payee on screen.
  const shown = CANONICAL.replace('"to":"me"', '"to":"attacker.near"');
  assert.equal((await checkOpAgainstHash(shown, HASH)).status, 'mismatch');
  // One byte is enough — whitespace included: the hash is of the exact string.
  assert.equal((await checkOpAgainstHash(CANONICAL + ' ', HASH)).status, 'mismatch');
  assert.equal((await checkOpAgainstHash('', HASH)).status, 'mismatch');
});

test('a row with no canonical op is reported as unchecked, never as verified', async () => {
  assert.equal((await checkOpAgainstHash(null, HASH)).status, 'absent');
  assert.equal((await checkOpAgainstHash(undefined, HASH)).status, 'absent');
});
