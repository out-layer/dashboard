'use client';

/**
 * The inbox's settings: whom the owner muted, the devices signed in to the
 * inbox, and the URL the owner is told at.
 *
 * Everything here is inside the session. Withdrawing another device and
 * naming or removing the webhook take one signature of the wallet as well,
 * made for that action and from that click, since a session's token alone
 * must not do them. A list that could not be read is said as a failure,
 * never drawn as empty.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { CopyText } from '@/components/ui/copy-text';
import { PageHeader } from '@/components/ui/page-header';
import { RequireWallet } from '@/components/ui/require-wallet';
import { SignInPrompt } from '@/components/inbox/SignInPrompt';
import { useInbox } from '@/contexts/InboxContext';
import { useNearWallet } from '@/contexts/NearWalletContext';
import * as api from '@/lib/inbox/api';
import { confirmation, toBase64, type Confirmed } from '@/lib/inbox/crypto';
import { muteOf, webhookUrlOf, when } from '@/lib/inbox/settings';

const said = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The owner's signature for one action, asked of the wallet from the click
 * that made it. `null` when the wallet did not sign: nothing is sent then.
 */
function useConfirmation() {
  const { accountId, contractId, signMessage } = useNearWallet();
  return useCallback(
    async (action: Confirmed): Promise<api.Confirmation | null> => {
      if (!accountId) throw new Error('The wallet is not connected.');
      const at = Math.floor(Date.now() / 1000);
      const nonce = toBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)));
      const signed = await signMessage({ message: await confirmation(accountId, action, at), recipient: contractId, nonce });
      if (!signed) return null;
      if (signed.accountId !== accountId) throw new Error(`The wallet signed as ${signed.accountId}, not as ${accountId}.`);
      return { at, public_key: signed.publicKey, signature: signed.signature, nonce };
    },
    [accountId, contractId, signMessage],
  );
}

function Failure({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{children}</p>
  );
}

function Done({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-foreground">{children}</p>;
}

function Section({ title, about, children }: { title: string; about: ReactNode; children: ReactNode }) {
  return (
    <section className="max-w-3xl space-y-3 rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{about}</p>
      {children}
    </section>
  );
}

const field =
  'h-9 w-full min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent';

type Asked<T> = { found: T | null; error: string | null; busy: string | null; done: string | null };
const asked = <T,>(): Asked<T> => ({ found: null, error: null, busy: null, done: null });

/** One list of the API, read on entry and after every change to it. */
function useAsked<T>(read: (base: string, token: string) => Promise<T>) {
  const { token, coordinatorUrl, refresh } = useInbox();
  const [state, setState] = useState<Asked<T>>(asked<T>());

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const found = await read(coordinatorUrl, token);
      setState((was) => ({ ...was, found, error: null }));
    } catch (e) {
      setState((was) => ({ ...was, error: said(e) }));
    }
  }, [token, coordinatorUrl, read]);

  useEffect(() => {
    void load();
  }, [load]);

  /** A change, then the list as the API has it now. */
  const change = useCallback(
    async (name: string, work: (base: string, token: string) => Promise<string>) => {
      if (!token) return;
      setState((was) => ({ ...was, busy: name, error: null, done: null }));
      try {
        const done = await work(coordinatorUrl, token);
        setState((was) => ({ ...was, busy: null, done }));
        await load();
        await refresh();
      } catch (e) {
        setState((was) => ({ ...was, busy: null, error: said(e) }));
      }
    },
    [token, coordinatorUrl, load, refresh],
  );

  return { ...state, change };
}

const readMutes = (base: string, token: string) => api.listMutes(base, token).then((answer) => answer.mutes);

function Mutes() {
  const { found, error, busy, done, change } = useAsked(readMutes);
  const [typed, setTyped] = useState('');
  const [deleteWaiting, setDeleteWaiting] = useState(true);
  const [refused, setRefused] = useState<string | null>(null);

  const add = () => {
    const named = muteOf(typed);
    if (!named.ok) {
      setRefused(named.why);
      return;
    }
    setRefused(null);
    void change('add', async (base, token) => {
      const { deleted } = await api.mute(base, token, named.mute, deleteWaiting);
      setTyped('');
      const whom = named.mute.subject_is === 'agent' ? 'The agent' : 'The project';
      return deleteWaiting
        ? `${whom} ${named.mute.subject} is muted. Tasks deleted: ${deleted}.`
        : `${whom} ${named.mute.subject} is muted. Its tasks that wait stay.`;
    });
  };

  return (
    <Section
      title="Muted"
      about="A muted agent, or a muted project, can leave you no task: its run is refused when it tries. Nothing else of the agent changes — what it may do is set by your policies."
    >
      {found !== null && found.length === 0 && <p className="text-sm text-muted-foreground">Nobody is muted.</p>}
      {found !== null && found.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {found.map((mute) => (
            <li key={`${mute.subject_is}:${mute.subject}`} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <span className="min-w-0">
                <span className="text-muted-foreground">{mute.subject_is === 'agent' ? 'Agent' : 'Project'} </span>
                <span className="break-all font-mono text-foreground">{mute.subject}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void change(`unmute:${mute.subject}`, async (base, token) => {
                    await api.unmute(base, token, mute);
                    return `${mute.subject} may leave you tasks again.`;
                  })
                }
              >
                {busy === `unmute:${mute.subject}` ? 'Unmuting…' : 'Unmute'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <label htmlFor="mute-subject" className="text-sm font-medium text-foreground">
          Mute an agent or a project
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="mute-subject"
            className={`${field} font-mono`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="agent.near, or a project's uuid"
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="outline" disabled={busy !== null || !typed.trim()} onClick={add}>
            {busy === 'add' ? 'Muting…' : 'Mute'}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={deleteWaiting} onChange={(event) => setDeleteWaiting(event.target.checked)} />
          Also delete its tasks that wait for me
        </label>
      </div>

      {refused && <Failure>{refused}</Failure>}
      {error && <Failure>{error}</Failure>}
      {done && <Done>{done}</Done>}
    </Section>
  );
}

function Devices() {
  const { signOut } = useInbox();
  const { found, error, busy, done, change } = useAsked(api.listDevices);
  const confirm = useConfirmation();

  return (
    <Section
      title="Devices"
      about="Each browser or app you signed in from holds a key of its own, and a task is encrypted to every one of them. Withdrawing a device ends its session: it lists nothing more and new tasks are not encrypted to it. Withdrawing another device is signed by your wallet, so a session alone cannot do it."
    >
      {found !== null && found.length === 0 && <p className="text-sm text-muted-foreground">No device is signed in.</p>}
      {found !== null && found.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {found.map((device) => (
            <li key={device.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
              <dl className="min-w-0 space-y-1">
                <div>
                  <dt className="sr-only">Device</dt>
                  <dd className="font-medium text-foreground">
                    {device.this ? 'This browser' : 'Another device'}
                    <span className="ml-2 font-normal text-muted-foreground">
                      signed in {when(device.created_at)}, until {when(device.valid_until)}
                    </span>
                  </dd>
                </div>
                <div className="text-xs text-muted-foreground">
                  <dt className="inline">Device key </dt>
                  <dd className="inline break-all font-mono">{device.device_pubkey}</dd>
                </div>
                <div className="text-xs text-muted-foreground">
                  <dt className="inline">Signed in by the wallet key </dt>
                  <dd className="inline break-all font-mono">{device.signer_pubkey}</dd>
                </div>
              </dl>
              {device.this ? (
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void signOut()}>
                  Sign out
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void change(`withdraw:${device.id}`, async (base, token) => {
                      const signed = await confirm({ withdraw_device: device.id });
                      if (!signed) return 'The wallet did not sign, so nothing changed.';
                      const { revoked } = await api.withdrawDevice(base, token, device.id, signed);
                      return revoked ? 'The device is withdrawn.' : 'The device was withdrawn already.';
                    })
                  }
                >
                  {busy === `withdraw:${device.id}` ? 'Waiting for the wallet…' : 'Withdraw, signed by your wallet'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">
        A device you lost, or do not recognise: withdraw it here. If the wallet on it is lost too, remove the wallet
        key shown beside it from your account, in your wallet: with that key gone no task is encrypted to a device it
        signed in, and its session ends.
      </p>
      {error && <Failure>{error}</Failure>}
      {done && <Done>{done}</Done>}
    </Section>
  );
}

function Webhook() {
  const { found, error, busy, done, change } = useAsked(api.webhook);
  const confirm = useConfirmation();
  const [typed, setTyped] = useState('');
  const [refused, setRefused] = useState<string | null>(null);
  /** Told once by the API, shown until the owner leaves the page. */
  const [secret, setSecret] = useState<string | null>(null);

  const save = () => {
    const named = webhookUrlOf(typed);
    if (!named.ok) {
      setRefused(named.why);
      return;
    }
    setRefused(null);
    void change('save', async (base, token) => {
      const signed = await confirm({ name_webhook: named.url });
      if (!signed) return 'The wallet did not sign, so nothing changed.';
      const named_ = await api.setWebhook(base, token, named.url, signed);
      setTyped('');
      setSecret(named_.secret ?? null);
      return 'Task events go to this URL from now on.';
    });
  };

  return (
    <Section
      title="Webhook"
      about="A URL that is told when a task is made for you, answered, or expired. An event says who asked, of which project and when, and links to the task. It carries nothing of what the task shows: that is read here, on a signed-in device. Naming or removing the URL is signed by your wallet; the wallet shows the URL as its hash."
    >
      {found !== null && (
        <p className="text-sm text-foreground">
          {found.url === null ? (
            <span className="text-muted-foreground">No URL is named.</span>
          ) : (
            <>
              <span className="text-muted-foreground">Events go to </span>
              <span className="break-all font-mono">{found.url}</span>
            </>
          )}
        </p>
      )}
      {found?.url && found.set_at !== null && (
        <p className="text-xs text-muted-foreground">
          Named {when(found.set_at)}, {found.set_here ? 'in this session' : 'in another session'}, signed in by the
          wallet key <span className="break-all font-mono">{found.set_by_key}</span>
        </p>
      )}
      {found?.url && !found.set_here && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
          <span className="font-semibold">Named elsewhere. </span>
          This URL was named in a session that is over, or on another device. It is told of every task made for you.
          Remove it if it is not yours.
        </p>
      )}
      <div className="space-y-2 border-t border-border pt-3">
        <label htmlFor="webhook-url" className="text-sm font-medium text-foreground">
          {found?.url ? 'Replace the URL' : 'Name a URL'}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="webhook-url"
            type="url"
            className={`${field} font-mono`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="https://example.com/outlayer-tasks"
            autoComplete="off"
            spellCheck={false}
          />
          <Button variant="outline" disabled={busy !== null || !typed.trim()} onClick={save}>
            {busy === 'save' ? 'Waiting for the wallet…' : 'Save, signed by your wallet'}
          </Button>
          {found?.url && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() =>
                void change('remove', async (base, token) => {
                  const signed = await confirm({ remove_webhook: true });
                  if (!signed) return 'The wallet did not sign, so nothing changed.';
                  await api.deleteWebhook(base, token, signed);
                  setSecret(null);
                  return 'No URL is told of your tasks.';
                })
              }
            >
              {busy === 'remove' ? 'Waiting for the wallet…' : 'Remove, signed by your wallet'}
            </Button>
          )}
        </div>
      </div>
      {refused && <Failure>{refused}</Failure>}
      {error && <Failure>{error}</Failure>}
      {done && <Done>{done}</Done>}
      {secret && found?.url && (
        <div className="space-y-2 rounded-md border border-accent/50 bg-card-muted p-3 text-sm text-foreground">
          <p>
            <span className="font-semibold">The secret the events are signed with. </span>
            Shown now and never again: keep it where your receiver checks{' '}
            <span className="font-mono">X-Webhook-Signature</span>, the HMAC-SHA256 of the body in hex. Naming a
            URL again makes a new one.
          </p>
          <CopyText value={secret} className="break-all font-mono text-xs" />
        </div>
      )}
    </Section>
  );
}

function DeleteAll() {
  const { token, coordinatorUrl, refresh } = useInbox();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const remove = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { deleted } = await api.deleteTasks(coordinatorUrl, token);
      setDone(`Tasks deleted: ${deleted}.`);
      setSure(false);
      await refresh();
    } catch (e) {
      setError(said(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Delete every task"
      about="Every task addressed to you, waiting or closed, with what it showed, its files and its outcome. An agent that asks of a deleted task is told there is no such task. This cannot be undone."
    >
      {sure ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy ? 'Deleting…' : 'Delete every task of mine'}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setSure(false)}>
            Keep them
          </Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setSure(true)}>
          Delete every task…
        </Button>
      )}
      {error && <Failure>{error}</Failure>}
      {done && <Done>{done}</Done>}
    </Section>
  );
}

function Settings() {
  const { session } = useInbox();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (session !== 'active') return <SignInPrompt />;

  return (
    <div className="space-y-6">
      <Mutes />
      <Devices />
      <Webhook />
      <DeleteAll />
      <Link href="/inbox" className="inline-block text-sm text-accent-text hover:underline">
        Back to the inbox
      </Link>
    </div>
  );
}

export default function InboxSettingsPage() {
  const { isConnected } = useNearWallet();
  return (
    <div className="w-full">
      <PageHeader title="Inbox settings" description="Who may ask you, which devices read what they ask, and where you are told." />
      {isConnected ? <Settings /> : <RequireWallet subject="your inbox settings" />}
    </div>
  );
}
