/**
 * What a top-up with NEAR came to, read off its transactions.
 *
 * A top-up is two transactions. The owner's runs the swap project: it succeeds
 * on chain whatever the swap did, and the project's `{success, ...}` is only in
 * its return value. The swap account's own `ft_transfer_call` then credits the
 * key: it also succeeds on chain when the key refuses the money, and its return
 * value is the amount the key kept.
 */

/** The account the swap project signs for. It holds the funds during a swap. */
export const NEAR_TOPUP_SWAP_ACCOUNT = 'v1.publishintent.near';

export type SwapAnswer =
  /** The swap went through and the credit was sent in `creditTx`. */
  | { state: 'swapped'; usdc: string; creditTx: string }
  /** The swap project said no. */
  | { state: 'not_swapped'; reason: string }
  /** The owner's transaction itself failed on chain. */
  | { state: 'failed'; reason: string }
  /** The outcome carries no final answer yet. */
  | { state: 'unknown' };

function decode(returned: string): unknown {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(returned), (c) => c.charCodeAt(0))));
}

function statusOf(outcome: unknown): { SuccessValue?: string; Failure?: unknown } | null {
  const status = (outcome as { status?: unknown } | null | undefined)?.status as
    | { SuccessValue?: string; Failure?: unknown }
    | string
    | null
    | undefined;
  return status !== null && typeof status === 'object' ? status : null;
}

/** The transaction's hash, under whichever name the wallet returned it. */
export function txHashOf(outcome: unknown): string | null {
  const seen = outcome as { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | null | undefined;
  return seen?.transaction?.hash ?? seen?.transaction_outcome?.id ?? null;
}

function failureWords(failure: unknown): string {
  const kind = (failure as { ActionError?: { kind?: { FunctionCallError?: { ExecutionError?: unknown } } } } | null)
    ?.ActionError?.kind?.FunctionCallError?.ExecutionError;
  return typeof kind === 'string' ? kind : JSON.stringify(failure);
}

/** Reads the owner's transaction. */
export function readSwap(outcome: unknown): SwapAnswer {
  const status = statusOf(outcome);
  if (!status) return { state: 'unknown' };
  if (status.Failure !== undefined) return { state: 'failed', reason: failureWords(status.Failure) };
  if (typeof status.SuccessValue !== 'string' || status.SuccessValue === '') return { state: 'unknown' };

  let answer: { success?: unknown; error?: unknown; usdc_amount?: unknown; tx_hashes?: unknown } | null;
  try {
    answer = decode(status.SuccessValue) as typeof answer;
  } catch {
    return { state: 'unknown' };
  }
  if (answer === null || typeof answer !== 'object' || typeof answer.success !== 'boolean') {
    return { state: 'unknown' };
  }
  if (!answer.success) {
    return {
      state: 'not_swapped',
      reason: typeof answer.error === 'string' && answer.error ? answer.error : 'The swap project gave no reason.',
    };
  }
  const hashes = Array.isArray(answer.tx_hashes) ? answer.tx_hashes : [];
  const creditTx = hashes[hashes.length - 1];
  if (typeof answer.usdc_amount !== 'string' || typeof creditTx !== 'string') return { state: 'unknown' };
  return { state: 'swapped', usdc: answer.usdc_amount, creditTx };
}

/**
 * Reads the swap account's `ft_transfer_call`: true when the key kept all of
 * `usdc`, false when it kept less, null while there is no final answer.
 */
export function readCredit(outcome: unknown, usdc: string): boolean | null {
  const status = statusOf(outcome);
  if (!status) return null;
  if (status.Failure !== undefined) return false;
  if (typeof status.SuccessValue !== 'string' || status.SuccessValue === '') return null;
  try {
    const kept = decode(status.SuccessValue);
    return typeof kept === 'string' ? BigInt(kept) >= BigInt(usdc) : null;
  } catch {
    return null;
  }
}

/** A stablecoin amount in minimal units (6 decimals), the way a person reads it. */
export function usdcWords(minimal: string): string {
  const padded = minimal.padStart(7, '0');
  const fraction = padded.slice(-6).replace(/0+$/, '');
  return `$${padded.slice(0, -6)}${fraction ? `.${fraction}` : ''}`;
}
