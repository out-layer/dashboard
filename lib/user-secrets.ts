/**
 * Reading an account's secrets out of the contract, all of them.
 *
 * `list_user_secrets` hands out a PAGE — it walks an index and reads storage per
 * entry, so an unbounded answer is a view that eventually cannot be called at
 * all. Asking without the paging arguments returns the first 100 and says
 * nothing about the rest, which is how a page can show somebody a truncated
 * inventory of their own secrets and look complete doing it.
 *
 * **This has to work against two contracts at once.** The paging arguments are
 * recent: an older deployment — mainnet, at the time of writing — ignores them
 * and answers the WHOLE list to every request, because near-sdk drops arguments
 * it does not know. So the walk stops on three conditions, and each covers a
 * different world:
 *
 * * an EMPTY page ends it — the new contract's honest "nothing left";
 * * a SHORT page ends it — what the old contract always returns, since its one
 *   answer is shorter than the window we asked for. Against the new contract
 *   this is imperfect in one case that cannot currently arise: the window is
 *   taken before entries whose secret is gone are dropped, so a short page could
 *   in principle have more behind it. Nothing produces such an entry today —
 *   the single place that removes a secret also cleans the index;
 * * a ROUND CEILING ends it regardless, so no contract behaviour turns this into
 *   an infinite loop hammering the RPC.
 */

/** The signature of `viewMethod` from `NearWalletContext`. */
type ViewMethod = (params: {
  contractId: string;
  method: string;
  args?: Record<string, unknown>;
}) => Promise<unknown>;

const PAGE = 200;
const MAX_ROUNDS = 100;

export async function listAllUserSecrets<T = unknown>(
  viewMethod: ViewMethod,
  contractId: string,
  accountId: string,
): Promise<T[]> {
  const all: T[] = [];
  let fromIndex = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const page = (await viewMethod({
      contractId,
      method: 'list_user_secrets',
      args: { account_id: accountId, from_index: fromIndex, limit: PAGE },
    })) as T[] | null;

    const batch = Array.isArray(page) ? page : [];
    if (batch.length === 0) return all;
    all.push(...batch);
    if (batch.length < PAGE) return all;
    fromIndex += PAGE;
  }

  return all;
}
