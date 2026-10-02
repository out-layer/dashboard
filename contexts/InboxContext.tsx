'use client';

/**
 * What waits for the signed-in owner: the tasks their agents left them and
 * the approvals of the wallets they own.
 *
 * Nothing is asked of the API without a session, and nothing is shown of one
 * that is not there: no count, no list. An account is signed in in several
 * browsers at a time, each with a session and a device key of its own; one
 * browser more than an account may have signs out the one signed in longest
 * ago, which is then said in so many words (`replaced`). The session is
 * opened by ONE message the wallet signs, and only from the owner's click
 * (`signIn`): the device's key pair is made ahead of the click, so nothing
 * slow stands between the click and the wallet.
 *
 * A task is encrypted for the browsers signed in when it was made. One that
 * came before this browser signed in is listed `locked`, and is made readable
 * here by one transaction of its project (`unlock`) — again only from the
 * owner's click. Approving a task is the card's: one message the wallet
 * signs, from the owner's click, and no transaction.
 *
 * Only a tab that is seen asks, once a minute: a hidden tab asks nothing and
 * reads again when it is shown. Each tab reads with the session kept in this
 * browser and that session's device key; a tab shown after another tab signed
 * in or out takes the session kept now before it reads. The tasks are read
 * first and the wallets' approvals after them.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { actionCreators } from '@near-js/transactions';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { getCoordinatorApiUrl } from '@/lib/api';
import { CALL_DEPOSIT, CALL_GAS, readAnswer, unlockCall } from '@/lib/inbox/act';
import * as api from '@/lib/inbox/api';
import { newDevice, readTask, statement, toBase64, type Device, type Read } from '@/lib/inbox/crypto';
import { clearSession, deleteDevice, loadDevice, loadSession, saveDevice, saveSession, type StoredSession } from '@/lib/inbox/store';

const POLL_INTERVAL_MS = 60_000;
/** A tab shown again reads at once only when its last read is at least this old. */
const SHOWN_AGAIN_MS = 15_000;
const SESSION_SECONDS = 30 * 24 * 60 * 60;

/** A task of the inbox, read on this device when it can be. */
export type ShownTask = api.InboxTask & {
  /** What the task shows, and the hash an answer names; absent when it did not open. */
  read: Read | null;
  /** Why it did not open. */
  unread: string | null;
};

export type ShownApproval = Record<string, unknown> & { id: string; wallet_pubkey: string };

/** `replaced`: the account signed in on one device too many, and this one was signed out. */
export type SessionState = 'none' | 'active' | 'ended' | 'replaced';

type Inbox = {
  session: SessionState;
  /** True until the first answer of a session arrives. */
  loading: boolean;
  tasks: ShownTask[];
  /** More wait than are listed: the list is the newest. */
  more: boolean;
  approvals: ShownApproval[];
  /**
   * The wallets' approvals being read for the first time this session: how
   * many wallets the owner's policies govern, and how many have answered.
   * Each is asked on its own, so many wallets read slowly. `null` once read.
   */
  readingApprovals: { wallets: number; read: number } | null;
  /** What waits: open tasks and pending approvals. Zero without a session. */
  count: number;
  error: string | null;
  signingIn: boolean;
  /** From a click only: opens the wallet to sign the statement. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  /** The tasks alone, without the wallets' approvals: for reading again often. */
  refreshTasks: () => Promise<void>;
  /**
   * From a click only: one transaction of the project's `tasks_unlock` on the
   * owner's row `profile`, which writes the copies of every task of the project
   * that waits for the owner for the browsers signed in now; then the list is
   * read again. Throws with the project's refusal, or the wallet's.
   */
  unlock: (projectId: string, profile: string) => Promise<void>;
  /** The session's token, for the calls a page makes itself. */
  token: string | null;
  coordinatorUrl: string;
};

const InboxContext = createContext<Inbox | undefined>(undefined);

export function useInbox(): Inbox {
  const inbox = useContext(InboxContext);
  if (!inbox) throw new Error('useInbox is used inside InboxProvider');
  return inbox;
}

export function InboxProvider({ children }: { children: ReactNode }) {
  const { accountId, isConnected, network, contractId, viewMethod, signMessage } = useNearWallet();
  const { signAndSendTransaction } = useNearWallet();
  const coordinatorUrl = getCoordinatorApiUrl(network);

  const [stored, setStored] = useState<StoredSession | null>(null);
  const [ended, setEnded] = useState<false | 'ended' | 'replaced'>(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [tasks, setTasks] = useState<ShownTask[]>([]);
  const [approvals, setApprovals] = useState<ShownApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [more, setMore] = useState(false);
  const [readingApprovals, setReadingApprovals] = useState<{ wallets: number; read: number } | null>(null);
  /** The approvals were read once this session: later reads are not shown as progress. */
  const approvalsKnown = useRef(false);
  /** Made ahead of the click that signs in. */
  const prepared = useRef<Device | null>(null);
  /** Moves when another tab changed the session kept: the session is taken from storage again. */
  const [kept, setKept] = useState(0);
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const viewMethodRef = useRef(viewMethod);
  viewMethodRef.current = viewMethod;

  // The session this browser holds for the account, and the device's key.
  useEffect(() => {
    setTasks([]);
    setApprovals([]);
    setReadingApprovals(null);
    approvalsKnown.current = false;
    setError(null);
    setEnded(false);
    setDevice(null);
    if (!isConnected || !accountId) {
      setStored(null);
      return;
    }
    const session = loadSession(network, accountId);
    setStored(session);
    let cancelled = false;
    if (session) {
      loadDevice(network, accountId, session.deviceId)
        .then((found) => !cancelled && setDevice(found))
        .catch(() => !cancelled && setDevice(null));
    } else {
      newDevice()
        .then((made) => {
          if (!cancelled) prepared.current = made;
        })
        .catch(() => {
          prepared.current = null;
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isConnected, accountId, network, kept]);

  // Another tab signed in or out of the account: this tab takes the session
  // kept now, with its key, once it is seen.
  useEffect(() => {
    if (!isConnected || !accountId) return;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      if ((loadSession(network, accountId)?.token ?? null) !== (storedRef.current?.token ?? null)) setKept((n) => n + 1);
    };
    document.addEventListener('visibilitychange', take);
    window.addEventListener('storage', take);
    return () => {
      document.removeEventListener('visibilitychange', take);
      window.removeEventListener('storage', take);
    };
  }, [isConnected, accountId, network]);

  const endSession = useCallback(
    (why: 'ended' | 'replaced') => {
      if (!accountId) return;
      // The key of a session that is over reads nothing more.
      if (stored) {
        void deleteDevice(network, accountId, stored.deviceId).catch(() => undefined);
        clearSession(network, accountId, stored.token);
      }
      setStored(null);
      setDevice(null);
      setEnded(why);
      setTasks([]);
      setApprovals([]);
      newDevice()
        .then((made) => {
          prepared.current = made;
        })
        .catch(() => {
          prepared.current = null;
        });
    },
    [accountId, network, stored],
  );

  /** The tasks as the API listed them, each read on this device when it can be. */
  const show = useCallback(
    async (listed: api.InboxTask[]) => {
      const owner = accountId;
      if (!owner) return;
      const shown = await Promise.all(
        listed.map(async (task): Promise<ShownTask> => {
          if (task.locked || task.content === null || task.device_copy === null) {
            return { ...task, read: null, unread: task.locked ? 'locked' : null };
          }
          if (!device) return { ...task, read: null, unread: 'this browser no longer holds the device key' };
          try {
            return { ...task, read: await readTask(device, task, owner), unread: null };
          } catch (e) {
            return { ...task, read: null, unread: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      setTasks(shown);
    },
    [accountId, device],
  );

  /** A failure to ask: a session that ended ends here; any other is said, and what was shown stays shown. */
  const failed = useCallback(
    (e: unknown) => {
      if (e instanceof api.InboxRefused && e.sessionEnded) {
        endSession(e.sessionReplaced ? 'replaced' : 'ended');
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    },
    [endSession],
  );

  const listTasks = useCallback(async (): Promise<api.InboxTask[] | null> => {
    if (!stored) return null;
    try {
      const listed = await api.listTasks(coordinatorUrl, stored.token);
      setMore(listed.more);
      setError(null);
      return listed.tasks;
    } catch (e) {
      failed(e);
      return null;
    }
  }, [stored, coordinatorUrl, failed]);

  /**
   * What waits on the wallets the owner's policies govern: one read of the
   * chain, then every wallet's pending approvals at once. Slower than the
   * tasks, and never in their way.
   */
  const listApprovals = useCallback(async (): Promise<ShownApproval[] | null> => {
    if (!stored || !accountId || !contractId) return null;
    try {
      const first = !approvalsKnown.current;
      if (first) setReadingApprovals({ wallets: 0, read: 0 });
      const listed = (await viewMethodRef
        .current({ contractId, method: 'get_wallet_policies_by_owner', args: { owner: accountId } })
        .catch(() => [])) as Array<{ wallet_pubkey: string; frozen?: boolean }>;
      // A frozen wallet signs nothing until it is unfrozen, and starts nothing
      // new: what waits on it is not asked about here. The approvals page
      // lists it, marked frozen.
      const wallets = (Array.isArray(listed) ? listed : []).filter((wallet) => !wallet.frozen);
      if (first) setReadingApprovals({ wallets: wallets.length, read: 0 });
      const pending = await Promise.all(
        wallets.map(async (wallet) => {
          const found = (await api.pendingApprovals(coordinatorUrl, stored.token, wallet.wallet_pubkey)).map(
            (approval): ShownApproval => ({ ...approval, id: String(approval.id), wallet_pubkey: wallet.wallet_pubkey }),
          );
          if (first) setReadingApprovals((was) => (was ? { ...was, read: was.read + 1 } : was));
          return found;
        }),
      );
      approvalsKnown.current = true;
      setReadingApprovals(null);
      return pending.flat();
    } catch (e) {
      setReadingApprovals(null);
      failed(e);
      return null;
    }
  }, [stored, accountId, contractId, coordinatorUrl, failed]);

  /** The tasks alone: what a page reads again while what the owner sent is carried out. */
  const refreshTasks = useCallback(async () => {
    const listed = await listTasks();
    if (listed) await show(listed);
    setLoading(false);
  }, [listTasks, show]);

  /** The tasks, shown as soon as they are read, and the wallets' approvals after them. */
  const refresh = useCallback(async () => {
    await refreshTasks();
    const found = await listApprovals();
    if (found) setApprovals(found);
  }, [listApprovals, refreshTasks]);

  // Only a seen tab asks: the tasks, then the approvals, once a minute. A
  // hidden tab stops; shown again, it reads at once unless it read moments
  // ago. A tab whose session another tab replaced asks nothing with it.
  useEffect(() => {
    if (!stored || !accountId) return;
    setLoading(true);
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let lastRead = 0;
    const tick = async () => {
      lastRead = Date.now();
      const listed = await listTasks();
      if (cancelled) return;
      if (listed) await show(listed);
      setLoading(false);
      const found = await listApprovals();
      if (cancelled) return;
      if (found) setApprovals(found);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const seen = () => {
      if (document.visibilityState !== 'visible' || loadSession(network, accountId)?.token !== stored.token) {
        stop();
        return;
      }
      if (timer) return;
      if (Date.now() - lastRead >= SHOWN_AGAIN_MS) void tick();
      timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
    };
    seen();
    document.addEventListener('visibilitychange', seen);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', seen);
    };
  }, [stored, accountId, network, listTasks, listApprovals, show]);

  const signIn = useCallback(async () => {
    if (!accountId) return;
    const made = prepared.current;
    if (!made) {
      setError('This browser could not make a device key. Try again in a moment.');
      return;
    }
    setError(null);
    setSigningIn(true);
    try {
      const validUntil = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      const nonce = toBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)));
      const signed = await signMessage({
        message: statement(accountId, made.pubkey, validUntil),
        recipient: contractId,
        nonce,
      });
      if (!signed) {
        setError('The wallet did not sign, so nothing changed.');
        return;
      }
      if (signed.accountId !== accountId) {
        setError(`The wallet signed as ${signed.accountId}, not as ${accountId}.`);
        return;
      }
      const session = await api.signIn(coordinatorUrl, {
        account_id: accountId,
        device_pubkey: made.pubkey,
        valid_until: validUntil,
        public_key: signed.publicKey,
        signature: signed.signature,
        nonce,
      });
      await saveDevice(network, accountId, session.device_id, made);
      const kept: StoredSession = {
        token: session.token,
        deviceId: session.device_id,
        accountId,
        validUntil: session.valid_until,
      };
      saveSession(network, kept);
      prepared.current = null;
      setDevice(made);
      setEnded(false);
      setStored(kept);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningIn(false);
    }
  }, [accountId, contractId, coordinatorUrl, network, signMessage]);

  const signOut = useCallback(async () => {
    if (!stored || !accountId) return;
    try {
      await api.signOut(coordinatorUrl, stored.token);
    } catch {
      // The session here ends whatever the API says of it.
    }
    await deleteDevice(network, accountId, stored.deviceId).catch(() => undefined);
    clearSession(network, accountId, stored.token);
    setStored(null);
    setDevice(null);
    setTasks([]);
    setApprovals([]);
    setEnded(false);
    prepared.current = await newDevice().catch(() => null);
  }, [stored, accountId, coordinatorUrl, network]);

  const unlock = useCallback(
    async (projectId: string, profile: string) => {
      if (!accountId) throw new Error('The wallet is not connected.');
      const outcome = await signAndSendTransaction({
        receiverId: contractId,
        actions: [actionCreators.functionCall('request_execution', unlockCall(projectId, accountId, profile), CALL_GAS, CALL_DEPOSIT)],
      });
      const answer = readAnswer(outcome as { status?: { SuccessValue?: string } });
      if (!answer.ok) throw new Error(answer.refusal);
      await refresh();
    },
    [accountId, contractId, signAndSendTransaction, refresh],
  );

  const value = useMemo<Inbox>(() => {
    const session: SessionState = stored ? 'active' : ended || 'none';
    const waiting = tasks.filter((t) => t.state === 'open').length + approvals.length;
    return {
      session,
      loading: session === 'active' && loading,
      tasks,
      more,
      approvals,
      readingApprovals: session === 'active' ? readingApprovals : null,
      count: session === 'active' ? waiting : 0,
      error,
      signingIn,
      signIn,
      signOut,
      refresh,
      refreshTasks,
      unlock,
      token: stored?.token ?? null,
      coordinatorUrl,
    };
  }, [stored, ended, tasks, more, approvals, readingApprovals, loading, error, signingIn, signIn, signOut, refresh, refreshTasks, unlock, coordinatorUrl]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}
