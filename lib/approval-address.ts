/**
 * Whether an operation waiting for approval pays an address the wallet's list
 * does not hold — the case `rules.addresses.unlisted: "ask"` puts in front of
 * the approvers. The approval pages say so beside the operation, and after the
 * approval offer to put the address on the list.
 */

/** The kinds a policy asks about when their address is off the list; every other kind aimed there is refused. */
const PAYMENT_KINDS = ['transfer', 'withdraw', 'intents_transfer', 'cross_chain_withdraw'];

/** The address a payment goes to, or `null` for any other operation. */
export function paymentDestination(op: Record<string, unknown>): string | null {
  return PAYMENT_KINDS.includes(String(op.kind)) && typeof op.to === 'string' && op.to ? op.to : null;
}

/** The engine's own comparison: exact, except that an EVM address is the same in any letter case. */
export function listsAddress(listed: string, destination: string): boolean {
  const evm = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
  return evm(listed) && evm(destination) ? listed.toLowerCase() === destination.toLowerCase() : listed === destination;
}

/**
 * The address a payment goes to, when `policy` (as `GET /wallet/v1/policy`
 * answers it) is an address list that asks about addresses it does not name
 * and this is one. `null` otherwise.
 */
export function unlistedDestination(policy: unknown, op: Record<string, unknown>): string | null {
  const destination = paymentDestination(op);
  if (!destination || !policy || typeof policy !== 'object') return null;
  const addresses = (policy as { rules?: { addresses?: { mode?: unknown; list?: unknown; unlisted?: unknown } } }).rules?.addresses;
  if (!addresses || (addresses.mode ?? 'whitelist') !== 'whitelist' || addresses.unlisted !== 'ask' || !Array.isArray(addresses.list)) {
    return null;
  }
  return addresses.list.some((a) => typeof a === 'string' && listsAddress(a, destination)) ? null : destination;
}

/** The wallet's policy, read with its key; `null` when it cannot be read. */
export async function readWalletPolicy(coordinatorUrl: string, apiKey: string): Promise<unknown> {
  const resp = await fetch(`${coordinatorUrl}/wallet/v1/policy`, { headers: { Authorization: `Bearer ${apiKey}` } }).catch(() => null);
  if (!resp || !resp.ok) return null;
  return resp.json().catch(() => null);
}
