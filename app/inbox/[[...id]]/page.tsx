'use client';

/**
 * The inbox: what the signed-in owner's agents ask of them, of every
 * project, and the approvals of the wallets they own.
 *
 * `/inbox/<task id>` — the link an agent hands its owner — shows that one
 * task first. Nothing is listed without a session; a failure to ask is said
 * as a failure, never drawn as an empty inbox.
 *
 * A task is encrypted for the browsers signed in when it was made, so one
 * made before this browser signed in is listed locked. Above the list, one
 * banner per project with such tasks offers the one transaction that makes
 * them readable here (`unlock` of the inbox); the wallet opens from its
 * button and from nothing else.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { SignInPrompt } from '@/components/inbox/SignInPrompt';
import { TaskCard } from '@/components/inbox/TaskCard';
import { useInbox, type ShownTask } from '@/contexts/InboxContext';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { isSent } from '@/lib/inbox/act';
import * as api from '@/lib/inbox/api';

function Closed() {
  const { token, coordinatorUrl } = useInbox();
  const [shown, setShown] = useState<api.InboxTask[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const listed = await api.listTasks(coordinatorUrl, token, 'closed');
      setShown(listed.tasks);
      setMore(listed.more);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  // Read with the page, and again whenever what waits changes: a task that
  // left the waiting list is here a moment later.
  const { tasks } = useInbox();
  const waiting = tasks.map((t) => t.id).join(' ');
  useEffect(() => {
    void load();
    // `load` is a new function on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, coordinatorUrl, waiting]);

  return (
    <section className="max-w-3xl space-y-2">
      <div className="flex items-baseline gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closed</h2>
        <span className="text-xs text-muted-foreground" title="What a closed task showed is deleted; its outcome is kept for 30 days.">
          last 30 days
        </span>
      </div>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{error}</p>
      )}
      {shown !== null && shown.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
      {shown !== null &&
        shown.map((task) => <TaskCard key={task.id} task={{ ...task, read: null, unread: null } satisfies ShownTask} />)}
      {more && <p className="text-sm text-muted-foreground">The newest are shown. Older closed tasks are kept and not listed.</p>}
    </section>
  );
}

/**
 * A webhook named in another session is told of every task. It is said on the
 * inbox itself, so an owner who signs in after somebody else sees it.
 */
function WebhookNamedElsewhere() {
  const { token, coordinatorUrl } = useInbox();
  const [found, setFound] = useState<api.InboxWebhook | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .webhook(coordinatorUrl, token)
      .then((answer) => !cancelled && setFound(answer))
      // The settings screen says a failure to ask; here nothing is claimed.
      .catch(() => !cancelled && setFound(null));
    return () => {
      cancelled = true;
    };
  }, [token, coordinatorUrl]);

  if (!found?.url || found.set_here) return null;
  return (
    <p className="max-w-3xl rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
      <span className="font-semibold">A webhook named elsewhere. </span>
      Every task made for you is told to <span className="break-all font-mono">{found.url}</span>, which was named in
      another session. If it is not yours,{' '}
      <Link href="/inbox/settings" className="text-accent-text hover:underline">
        remove it in the settings
      </Link>
      .
    </p>
  );
}

/** The waiting tasks of one project that this browser holds no copy of. */
type LockedOfProject = { project_id: string; profile: string; count: number };

/**
 * One project's tasks that arrived before this browser signed in, and the
 * button that makes them readable here: one transaction of the project's
 * `tasks_unlock`, from this click and from nothing else. The list is read
 * again once it is through.
 */
function LockedBanner({ locked }: { locked: LockedOfProject }) {
  const { unlock } = useInbox();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const one = locked.count === 1;

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlock(locked.project_id, locked.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className="max-w-3xl space-y-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
      <p className="text-base font-semibold text-destructive-text">
        {one ? '1 task is' : `${locked.count} tasks are`} not readable in this browser
      </p>
      <p>
        {one ? 'It' : 'They'} came from <span className="break-all font-mono">{locked.project_id}</span> before you signed in here,
        so {one ? 'it is' : 'they are'} encrypted for other browsers only. Make {one ? 'it' : 'them'} readable in this browser:
        one transaction to <span className="break-all font-mono">{locked.project_id}</span>, 0.1 NEAR attached and returned less
        the run&apos;s cost, about 0.0013 NEAR. It sends nothing and changes nothing.
      </p>
      <Button variant="default" onClick={() => void open()} disabled={busy}>
        {busy ? 'Waiting for the wallet…' : one ? 'Make it readable here' : 'Make them readable here'}
      </Button>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{error}</p>
      )}
    </div>
  );
}

function Inbox() {
  const params = useParams<{ id?: string[] }>();
  const wanted = params?.id?.[0] ?? null;
  const { session, loading, tasks, more, approvals, readingApprovals, error, refresh, refreshTasks, signOut } = useInbox();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // While something the owner sent is being carried out, the tasks are read
  // again every five seconds — the tasks alone, never the wallets' routes —
  // so that it leaves for Closed when its run ends rather than at the next
  // minute's poll. At most three minutes of it: a run that has not ended by
  // then is waited for at the usual pace.
  const sending = tasks.filter((t) => isSent(t.state)).map((t) => t.id).join(' ');
  const [quickReads, setQuickReads] = useState(0);
  useEffect(() => {
    if (!sending) {
      setQuickReads(0);
      return;
    }
    if (quickReads >= 36) return;
    const timer = setTimeout(() => {
      setQuickReads((n) => n + 1);
      void refreshTasks();
    }, 5000);
    return () => clearTimeout(timer);
  }, [sending, quickReads, refreshTasks]);

  // The waiting tasks this browser holds no copy of, by project, in the
  // list's order. The API lists `locked` only for a task that waits — open,
  // or approved and being carried out.
  const locked = useMemo(() => {
    const found = new Map<string, LockedOfProject>();
    for (const task of tasks) {
      if (task.locked) {
        const had = found.get(task.project_id);
        if (had) had.count += 1;
        else found.set(task.project_id, { project_id: task.project_id, profile: task.profile, count: 1 });
      }
    }
    return [...found.values()];
  }, [tasks]);

  if (!mounted) return null;
  if (session !== 'active') return <SignInPrompt />;

  const first = wanted ? tasks.filter((t) => t.id === wanted) : [];
  // What waits for the owner first; what they sent, folded, after it.
  const rest = tasks.filter((t) => t.id !== wanted && !isSent(t.state));
  const sent = tasks.filter((t) => t.id !== wanted && isSent(t.state));
  const nothing = tasks.length === 0 && approvals.length === 0 && readingApprovals === null;

  return (
    <div className="space-y-6">
      {error && (
        <p className="max-w-3xl rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
          The inbox could not be asked just now: {error} What is shown below is what was last read.
        </p>
      )}

      <WebhookNamedElsewhere />

      {loading && tasks.length === 0 && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-8 w-8 animate-spin rounded-full border-b-2 border-accent" />
          Reading your tasks…
        </div>
      )}

      {readingApprovals && (
        <div className="max-w-3xl space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-accent" />
            {readingApprovals.wallets === 0
              ? 'Finding your wallets…'
              : `Reading the approvals of your wallets: ${readingApprovals.read} of ${readingApprovals.wallets}`}
          </div>
          {readingApprovals.wallets > 5 && (
            <p className="text-xs">
              Each wallet with a policy of yours is asked on its own, so {readingApprovals.wallets} wallets take a while.{' '}
              <Link href="/wallet/manage" className="text-accent-text hover:underline">
                Your wallets
              </Link>
            </p>
          )}
        </div>
      )}

      {wanted && first.length === 0 && !loading && (
        <p className="max-w-3xl rounded-md border border-info/30 bg-info/10 p-3 text-sm text-foreground">
          The task <span className="break-all font-mono">{wanted}</span> does not wait for this account: it was
          answered, withdrawn or deleted, it expired, or it was addressed to another account.
        </p>
      )}

      {locked.map((of) => (
        <LockedBanner key={of.project_id} locked={of} />
      ))}

      <div className="max-w-3xl space-y-4">
        {first.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {rest.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {sent.length > 0 && <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sent</h2>}
        {sent.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {more && (
          <p className="text-sm text-muted-foreground">
            These are the newest. More wait and are not listed: they appear as these are answered.
          </p>
        )}
      </div>

      {approvals.length > 0 && (
        <section className="max-w-3xl space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Wallet approvals</h2>
          <ul className="space-y-2">
            {approvals.map((approval) => (
              <li key={approval.id} className="rounded-lg border border-accent/50 bg-card p-4 text-sm">
                <Link href={`/wallet/approvals/${encodeURIComponent(approval.id)}`} className="font-medium text-accent-text hover:underline">
                  {String(approval.request_type ?? 'A request')} waits for your approval
                </Link>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{approval.wallet_pubkey}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && nothing && !error && (
        <EmptyState title="Nothing waits for you" description="What your agents ask of you, and the approvals of your wallets, appear here." />
      )}

      <Closed />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
        <Link
          href="/inbox/settings"
          className="inline-flex h-8 items-center rounded-md border border-border-strong px-3 text-xs font-semibold text-foreground transition-colors hover:border-accent hover:text-accent-text"
        >
          Muted agents, browsers, webhook
        </Link>
        <Button variant="ghost" size="sm" onClick={() => void signOut()} title="Ends this browser's session. Your tasks and other browsers are not touched.">
          Sign out
        </Button>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const { isConnected } = useNearWallet();
  return (
    <div className="w-full">
      <PageHeader title="Inbox" description="What your agents ask of you. You read it here; you act with a call of your own." />
      {isConnected ? <Inbox /> : <RequireWallet subject="your inbox" />}
    </div>
  );
}
