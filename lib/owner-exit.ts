/**
 * Owner exit: a NEAR account registered in the keystore DAO can leave with the keys of its
 * wallets. The contract side is `keystore-dao-contract/src/exit.rs`; the coordinator's is
 * `wallet/owner_exit.rs`. This file is what the `/exit` page needs: reading a link an agent
 * handed over, the owner's record, and the two calls that create a wallet.
 *
 * Nothing here opens a wallet. The page calls `signAndSendTransaction` and `signMessage`
 * itself, from a click.
 */

type NetworkType = 'testnet' | 'mainnet';

type ViewMethodFn = (params: { contractId: string; method: string; args?: Record<string, unknown> }) => Promise<unknown>;

/** What a link carries, as the coordinator MAC'd it. */
export interface ExitLink {
  key_hash: string;
  seed?: string;
  /** The keystore DAO of the network the link is for. */
  dao: string;
  /** Unix seconds after which the link creates nothing. */
  expires_at: number;
}

/**
 * Read a link's payload: `base64url(json) . base64url(mac)`. The MAC is the coordinator's to
 * check; this only shows the person what the link says before anything is signed.
 */
export function readExitLink(token: string): ExitLink | null {
  const [payload, mac] = token.split('.');
  if (!payload || !mac) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    if (typeof json?.key_hash !== 'string' || !/^[0-9a-f]{64}$/.test(json.key_hash)) return null;
    if (typeof json?.dao !== 'string' || typeof json?.expires_at !== 'number') return null;
    if (json.seed !== undefined && typeof json.seed !== 'string') return null;
    return { key_hash: json.key_hash, seed: json.seed, dao: json.dao, expires_at: json.expires_at };
  } catch {
    return null;
  }
}

/** The network a link is for, by its DAO; `null` when it is neither network's. */
export function networkOfLink(link: ExitLink, daoOf: (network: NetworkType) => string): NetworkType | null {
  for (const network of ['mainnet', 'testnet'] as NetworkType[]) {
    if (daoOf(network) === link.dao) return network;
  }
  return null;
}

/** The exit a record shows as pending, if its pending action is one. */
export function pendingExitOf(owner: ExitOwner): { nonce: number; finalizeAfter: Date; finalizeBefore: Date; approvals: string[] } | null {
  const pending = owner.pending;
  if (!pending || !('Exit' in pending.kind)) return null;
  return {
    nonce: pending.nonce,
    finalizeAfter: nsDate(pending.kind.Exit.finalize_after),
    finalizeBefore: nsDate(pending.kind.Exit.finalize_before),
    // The contract counts a vote only while its account is in the set in force.
    approvals: pending.approvals.filter((account) => owner.approvers.includes(account)),
  };
}

/** A typed list of accounts — commas, spaces or lines between them — as account ids. */
export function accountsOf(typed: string): { ok: true; accounts: string[] } | { ok: false; why: string } {
  const accounts = typed.split(/[\s,]+/).filter(Boolean);
  for (const account of accounts) {
    if (!/^(?=.{2,64}$)([a-z0-9]+[-_])*[a-z0-9]+(\.([a-z0-9]+[-_])*[a-z0-9]+)*$/.test(account)) {
      return { ok: false, why: `${account} is not a NEAR account id.` };
    }
  }
  if (new Set(accounts).size !== accounts.length) return { ok: false, why: 'An account is named twice.' };
  return { ok: true, accounts };
}

/** The exit's fees and timing on a network, from the DAO's `get_config().exit`. */
export interface ExitConfig {
  registrationFeeYocto: bigint;
  exitFeeYocto: bigint;
  minWindowSecs: number;
  maxWindowSecs: number;
  defaultWindowSecs: number;
  finalizeWindowSecs: number;
}

export async function getExitConfig(viewMethod: ViewMethodFn, dao: string): Promise<ExitConfig> {
  const config = (await viewMethod({ contractId: dao, method: 'get_config', args: {} })) as { exit?: Record<string, unknown> } | null;
  const exit = config?.exit;
  if (!exit) throw new Error(`${dao} does not offer an owner exit`);
  const num = (k: string): number => {
    const v = exit[k];
    if (typeof v !== 'number') throw new Error(`${dao}: no ${k} in get_config().exit`);
    return v;
  };
  const yocto = (k: string): bigint => {
    const v = exit[k];
    if (typeof v !== 'string' || !/^[0-9]+$/.test(v)) throw new Error(`${dao}: no ${k} in get_config().exit`);
    return BigInt(v);
  };
  return {
    registrationFeeYocto: yocto('registration_fee'),
    exitFeeYocto: yocto('exit_fee'),
    minWindowSecs: num('min_window_secs'),
    maxWindowSecs: num('max_window_secs'),
    defaultWindowSecs: num('default_window_secs'),
    finalizeWindowSecs: num('finalize_window_secs'),
  };
}

export type PendingExitAction =
  | { nonce: number; kind: { Exit: { finalize_after: number | string; finalize_before: number | string } }; approvals: string[] }
  | { nonce: number; kind: { SetApprovers: { approvers: string[]; threshold: number } }; approvals: string[] };

/** An owner's record in the DAO (`get_exit_owner`); `null`: not registered. */
export interface ExitOwner {
  generation: number;
  exit_window_secs: number;
  pending_exit_window: { secs: number; effective_at: number | string } | null;
  approvers: string[];
  threshold: number;
  pending: PendingExitAction | null;
  claim_in_flight: boolean;
  escrow_check: string | null;
}

export async function getExitOwner(viewMethod: ViewMethodFn, dao: string, account: string): Promise<ExitOwner | null> {
  return (await viewMethod({ contractId: dao, method: 'get_exit_owner', args: { account } })) as ExitOwner | null;
}

/** yoctoNEAR as a decimal NEAR amount with no trailing zeros. */
export function formatNear(yocto: bigint): string {
  const near = BigInt(10) ** BigInt(24);
  const whole = yocto / near;
  const frac = (yocto % near).toString().padStart(24, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** A window in seconds as hours or days. */
export function formatWindow(secs: number): string {
  if (secs >= 3_600 && secs % 3_600 === 0) return `${secs / 3_600} h`;
  if (secs >= 60 && secs % 60 === 0) return `${secs / 60} min`;
  return `${secs} s`;
}

/** A block timestamp in nanoseconds (a number, or a string past 2^53) as a Date. */
export function nsDate(ns: number | string): Date {
  return new Date(Number(BigInt(ns) / BigInt(1_000_000)));
}

/** What the coordinator answers before a signature is asked for. */
export interface PreparedOwnerWallet {
  registered: boolean;
  dao: string;
  generation: number | null;
  seed: string | null;
  key_hash: string;
  expires_at: number;
  /** The exact message the owner signs; `null` until the account is registered. */
  message: string | null;
  recipient: string;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.message || json?.error || `The request failed (${response.status})`);
  }
  return json as T;
}

export function prepareOwnerWallet(coordinatorUrl: string, link: string, accountId: string): Promise<PreparedOwnerWallet> {
  return post(`${coordinatorUrl}/wallet/v1/owner-wallet/prepare`, { link, account_id: accountId });
}

export interface CreatedOwnerWallet {
  wallet_id: string;
  near_account_id: string;
  owner: string;
  generation: number;
  seed: string;
}

export function createOwnerWallet(
  coordinatorUrl: string,
  body: { link: string; account_id: string; public_key: string; signature: string; nonce: string },
): Promise<CreatedOwnerWallet> {
  return post(`${coordinatorUrl}/wallet/v1/owner-wallet`, body);
}
