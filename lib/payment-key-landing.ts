/**
 * Whether a delete, close or refund claim of a payment key has taken effect, read from the
 * chain.
 *
 * A wallet answers once a transaction has executed, two or three blocks before its block is
 * final, and every view of the site reads at final finality: read at once, the key looks as it
 * did before the click. So the change is looked for until it shows, a bounded number of times.
 * The transaction is sent by then: a read that fails is a read to make again, never a failure
 * of the transaction. Nothing here opens a wallet.
 */

/** How often, and how many times, the chain is read again for a change that was just sent. */
export const LANDING_READ_MS = 1500;
export const LANDING_READS = 10;

/**
 * The contract's day between two refund claims of one key (`CLAIM_COOLDOWN_NS`), in
 * milliseconds.
 */
export const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** What `get_payment_key_flight` answers: what is in flight on a payment key. */
export interface PaymentKeyFlight {
  top_ups_in_flight: number;
  last_top_up_height: number;
  close_pending: boolean;
  claim_open: boolean;
  last_claim_at: number; // block timestamp, ns
  next_claim_at: number | null; // block timestamp, ns
}

/** The part of a refund ledger a close changes. */
export interface ClosingLedger {
  closing_since: number | null;
}

/** What the reads came to. */
export type Landing<S> =
  /** The chain shows the change, in `state`. */
  | { kind: 'shown'; state: S }
  /** Every read went through and none shows the change; `state` is the last one. */
  | { kind: 'not_shown'; state: S }
  /** No read went through; `error` is the last read's. */
  | { kind: 'unread'; error: unknown }
  /** Another account connected while the chain was read: nothing read belongs to it. */
  | { kind: 'left' };

/**
 * Read `read` until `shows` holds of what it returns, at most `LANDING_READS + 1` times,
 * `LANDING_READ_MS` apart. `current` says whether the account that sent the transaction is
 * still the connected one; once it is not, the reads stop and come to `left`.
 */
export async function untilShown<S>({
  read,
  shows,
  current,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  read: () => Promise<S>;
  shows: (state: S) => boolean;
  current: () => boolean;
  pause?: (ms: number) => Promise<void>;
}): Promise<Landing<S>> {
  let found: { state: S } | null = null;
  let unread: unknown = null;
  for (let n = 0; n <= LANDING_READS; n++) {
    if (n > 0) await pause(LANDING_READ_MS);
    if (!current()) return { kind: 'left' };
    try {
      const state = await read();
      found = { state };
      unread = null;
      if (shows(state)) return current() ? { kind: 'shown', state } : { kind: 'left' };
    } catch (e) {
      unread = e;
    }
  }
  if (!current()) return { kind: 'left' };
  if (found) return { kind: 'not_shown', state: found.state };
  return { kind: 'unread', error: unread };
}

/** Whether `secrets` (as `list_user_secrets` answers) holds the payment key `nonce`. */
export function keyListed(secrets: ReadonlyArray<{ accessor?: unknown; profile?: unknown }>, nonce: number): boolean {
  return secrets.some(
    (s) =>
      s.accessor != null &&
      typeof s.accessor === 'object' &&
      (s.accessor as { System?: unknown }).System === 'PaymentKey' &&
      s.profile === String(nonce),
  );
}

/** A delete took effect: the key is gone. A delete the coordinator did not confirm leaves it. */
export function deleteShows(state: { listed: boolean }): boolean {
  return !state.listed;
}

/**
 * A close took effect: the key is closing. The close marks it in its last receipt, once the
 * coordinator confirmed; a close it did not confirm leaves the key live. The page offers a
 * close only for a key that is not closing.
 */
export function closeShows(state: { ledger: ClosingLedger | null }): boolean {
  return state.ledger?.closing_since != null;
}

/**
 * A refund claim sent at `sentAtMs` (the browser's clock) was answered. Answered with a
 * quote, the key is gone. Answered with a refusal or not at all, the key stays closing and
 * its flight shows the claim closed (`claim_open` false) with this claim's time. The contract
 * refuses a claim within `CLAIM_COOLDOWN_MS` of the one before, so an accepted claim's time is
 * at least that much after any earlier one's: a claim time within half of it of `sentAtMs` is
 * this claim's, for a browser clock within twelve hours of the chain's.
 */
export function claimShows(sentAtMs: number) {
  return (state: { listed: boolean; flight: PaymentKeyFlight | null }): boolean =>
    !state.listed ||
    (state.flight != null &&
      !state.flight.claim_open &&
      state.flight.last_claim_at / 1_000_000 > sentAtMs - CLAIM_COOLDOWN_MS / 2);
}

/** The reason a wallet's outcome gives for a failed transaction, or null. */
export function failureOf(outcome: unknown): string | null {
  const failure = (outcome as { status?: { Failure?: unknown } } | null | undefined)?.status?.Failure;
  if (failure == null) return null;
  return typeof failure === 'string' ? failure : JSON.stringify(failure);
}
