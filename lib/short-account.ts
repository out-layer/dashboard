/**
 * An account as a person reads it in a tight place. A named account is its own
 * short form. An implicit account — 64 hex characters, which is what an agent's
 * custody wallet is — says nothing past its first and last few, so that is what
 * is shown, marked as an agent; the whole of it belongs in a tooltip.
 */
export function isImplicitAccount(account: string): boolean {
  return /^[0-9a-f]{64}$/.test(account);
}

export function shortAccount(account: string): string {
  return isImplicitAccount(account) ? `${account.slice(0, 7)}…${account.slice(-7)}` : account;
}
