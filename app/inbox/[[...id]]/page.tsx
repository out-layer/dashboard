'use client';

/**
 * The inbox: what the signed-in owner's agents ask of them, of every
 * project, and the approvals of the wallets they own.
 *
 * `/inbox/<task id>` — the link an agent hands its owner — shows that one
 * task first. Nothing is listed without a session; a failure to ask is said
 * as a failure, never drawn as an empty inbox.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { SignInPrompt } from '@/components/inbox/SignInPrompt';
import { TaskCard } from '@/components/inbox/TaskCard';
import { useInbox, type ShownTask } from '@/contexts/InboxContext';
import { useNearWallet } from '@/contexts/NearWalletContext';
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

  return (
    <section className="max-w-3xl space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground">Closed</h2>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          {shown === null ? 'Show the outcomes kept' : 'Refresh'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        What a closed task showed is deleted with it. Its outcome is kept 30 days.
      </p>
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{error}</p>
      )}
      {shown !== null && shown.length === 0 && <p className="text-sm text-muted-foreground">No outcomes are kept.</p>}
      {shown !== null &&
        shown.map((task) => <TaskCard key={task.id} task={{ ...task, read: null, unread: null } satisfies ShownTask} />)}
      {more && <p className="text-sm text-muted-foreground">These are the newest. Older outcomes are kept and not listed.</p>}
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

function Inbox() {
  const params = useParams<{ id?: string[] }>();
  const wanted = params?.id?.[0] ?? null;
  const { session, loading, tasks, more, approvals, error, refresh, signOut } = useInbox();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (session !== 'active') return <SignInPrompt />;

  const first = wanted ? tasks.filter((t) => t.id === wanted) : [];
  const rest = tasks.filter((t) => t.id !== wanted);
  const nothing = tasks.length === 0 && approvals.length === 0;

  return (
    <div className="space-y-6">
      {error && (
        <p className="max-w-3xl rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
          The inbox could not be asked just now: {error} What is shown below is what was last read.
        </p>
      )}

      <WebhookNamedElsewhere />

      {loading && nothing && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-8 w-8 animate-spin rounded-full border-b-2 border-accent" />
          Reading the inbox…
        </div>
      )}

      {wanted && first.length === 0 && !loading && (
        <p className="max-w-3xl rounded-md border border-info/30 bg-info/10 p-3 text-sm text-foreground">
          The task <span className="break-all font-mono">{wanted}</span> does not wait for this account: it was
          answered, withdrawn or deleted, it expired, or it was addressed to another account.
        </p>
      )}

      <div className="max-w-3xl space-y-4">
        {first.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
        {rest.map((task) => (
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
          Muted agents, devices, webhook
        </Link>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sign out of this device
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
