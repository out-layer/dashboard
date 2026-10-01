'use client';

/**
 * One task, drawn from its envelope. The page supplies the layout; the task
 * supplies words, and every one of them is drawn as text: nothing a task
 * carries is markup, a link, an image or an address to load.
 *
 * Reading, rejecting, deleting and muting are the session's. Approving is
 * one message the owner's wallet signs, from the button that says what
 * follows: the platform starts a run of the agent that prepared the task —
 * on the agent's own payment key — which carries it out. The owner sends no
 * transaction and pays nothing.
 *
 * For every open task the page checks the proof (`lib/inbox/proof`): that
 * the task was made by a published build of its project, in an approved
 * enclave, and that what that run answered names this task with the hash of
 * what is shown. A proof that does not hold, or could not be checked, is said
 * in its place, and the owner answers past it only by saying so.
 *
 * The framed panel shows the task three ways: as the form the project
 * prepared from the agent's request, each field a control the owner reads
 * but cannot edit, marked by who wrote it; as the exact bytes of the form
 * with their hash; and as the exact bytes the run that made it was asked
 * with, hashed here to the attestation's `input_hash`.
 *
 * A task made before this browser signed in is `locked`: it holds no copy
 * for this browser, so the preview says so in place of the form, only the
 * run's input can be shown, and nothing can be answered. The proof still
 * runs, up to the hash. The inbox page offers, per project, the one
 * transaction that makes such tasks readable here.
 *
 * A task that is no longer open holds no content: it is headed by the first
 * characters of its id, its badge says what became of it, and two runs offer
 * their attestations, each fetched from a click and shown as it is: the run
 * that made the task, and the run that carried it out (`run`), when there is
 * one — held, when fetched, to the agent and the project (`carriedBy`). A
 * task rejected, withdrawn or expired was carried out by nobody, and still
 * has the run that made it. A failed one says why.
 */

import { useEffect, useState } from 'react';
import AttestationModal from '@/components/AttestationModal';
import type { AttestationResponse } from '@/lib/api';
import { carriedBy, prove, verdict, type Origin, type Proof, type Step } from '@/lib/inbox/proof';
import { Badge } from '@/components/ui/badge';
import { AgentChip } from '@/components/ui/agent-chip';
import { Button } from '@/components/ui/button';
import { HashChip } from '@/components/ui/hash-chip';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { useInbox, type ShownTask } from '@/contexts/InboxContext';
import * as api from '@/lib/inbox/api';
import { PROVENANCE_LEGEND, approvalSentence, asks, failureWords, linesOf, made, madeBy, provenance, rowsOf, shortTaskId, supplyDigest, waits } from '@/lib/inbox/act';
import { MOST_REPLY_BYTES, fromBase64, openFile, replyBytes, saveName, toBase64, writeReply, type TaskField } from '@/lib/inbox/crypto';

const STATE_WORDS: Record<ShownTask['state'], string> = {
  open: 'Waiting for you',
  approved: 'Approved: being carried out',
  answering: 'Being acted on',
  done: 'Done',
  failed: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Withdrawn by the agent',
  expired: 'Expired',
  void: 'Void: the policy changed',
  unknown: 'In a state this page does not know',
};

/** The look of a field's control: a form field the owner reads, with room at its right edge for the mark. */
const CONTROL =
  'w-full min-w-0 cursor-default rounded-md border border-border bg-background py-1.5 pl-3 pr-9 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent';

/**
 * One field of the form: its label above, its value in a control the owner
 * cannot edit but can select and copy, and inside the control's right edge
 * the mark of who wrote it. A long text and a list are a text area sized to
 * their lines; everything else is one line.
 */
function Field({ field }: { field: TaskField }) {
  const { mark, title } = provenance(field.written_by);
  const value = field.kind === 'list' ? field.values.join('\n') : (field.values[0] ?? '');
  const tall = field.kind === 'list' || field.kind === 'long_text';
  return (
    <label className="block min-w-0">
      <span className="block break-words text-xs text-muted-foreground">{field.label}</span>
      <span className="relative mt-1 block">
        {tall ? (
          <textarea
            readOnly
            value={value}
            rows={field.kind === 'list' ? rowsOf(field.values.length, 1) : rowsOf(linesOf(value))}
            spellCheck={false}
            className={`${CONTROL} resize-y whitespace-pre-wrap break-words`}
          />
        ) : (
          <input
            readOnly
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            spellCheck={false}
            className={`${CONTROL} ${
              field.kind === 'account' || field.kind === 'address' ? 'font-mono' : field.kind === 'money' ? 'font-semibold tabular-nums' : ''
            }`}
          />
        )}
        <span role="img" aria-label={title} title={title} className="absolute right-2.5 top-1.5 select-none text-xs leading-5 text-muted-foreground">
          {mark}
        </span>
      </span>
    </label>
  );
}

/**
 * The three views of the form: the fields as drawn, the bytes the task's hash
 * is of, and the bytes the run that made it was asked with.
 */
type View = 'preview' | 'task' | 'input';

/**
 * `readable`: the task is open in this browser, so its form and its bytes
 * can be shown. `locked`: it is not, because it arrived before this browser
 * signed in; the preview then holds the notice that says so. The run's input
 * does not depend on the task's content and is always available.
 */
function ViewSwitch({ view, readable, locked, onChange }: { view: View; readable: boolean; locked: boolean; onChange: (view: View) => void }) {
  const choice = (value: View, label: string, enabled = true) => (
    <button
      type="button"
      aria-pressed={view === value}
      disabled={!enabled}
      title={enabled ? undefined : 'Once the task is readable in this browser'}
      onClick={() => onChange(value)}
      className={`rounded px-2 py-0.5 text-xs transition-colors ${
        view === value
          ? 'bg-card font-medium text-foreground shadow-sm'
          : enabled
            ? 'text-muted-foreground hover:text-foreground'
            : 'text-faint-foreground'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="View" className="inline-flex shrink-0 gap-0.5 rounded-md border border-border bg-card-muted p-0.5">
      {choice('preview', 'Preview', readable || locked)}
      {choice('task', 'RAW form', readable)}
      {choice('input', 'RAW request')}
    </div>
  );
}

/** Exact bytes under the line that says what they are, to copy, and their hash under the line that says what the hash is. */
function RawBytes({ about, text, hash, says }: { about: string; text: string; hash: string | null; says: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{about}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-card-muted p-3 font-mono text-xs text-foreground">
        {text}
      </pre>
      <Button variant="outline" size="sm" onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy raw'}
      </Button>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {says}
        {hash === null ? <span>computing…</span> : <HashChip value={hash} />}
      </p>
    </div>
  );
}

/**
 * What the run that made the task was asked, once the proof has read it. The
 * hash is computed here, from the bytes shown, when the view is first opened.
 */
function RawInput({ proof }: { proof: Proof<AttestationResponse> | null }) {
  const input = proof?.input ?? null;
  const [hashed, setHashed] = useState<{ of: string; hash: string } | null>(null);
  useEffect(() => {
    if (input === null) return;
    let cancelled = false;
    void import('@/lib/near-rpc')
      .then(({ sha256 }) => sha256(input))
      .then((hash) => {
        if (!cancelled) setHashed({ of: input, hash });
      });
    return () => {
      cancelled = true;
    };
  }, [input]);
  if (proof === null) return <p className="text-sm text-muted-foreground">Loading the run&apos;s input…</p>;
  if (input === null) {
    return (
      <p className="text-sm text-muted-foreground">
        This run was asked on chain; its input is in the transaction, which the attestation window checks.
      </p>
    );
  }
  return (
    <RawBytes
      about="The agent's request to the connector, as the run's attestation hashes it."
      text={input}
      hash={hashed?.of === input ? hashed.hash : null}
      says="SHA-256 of these bytes, the input_hash of the run's attestation:"
    />
  );
}

export function TaskCard({ task }: { task: ShownTask }) {
  const { accountId, contractId, network, viewMethod, signMessage } = useNearWallet();
  const { token, coordinatorUrl, refresh } = useInbox();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [supplied, setSupplied] = useState('');
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<Proof<AttestationResponse> | null>(null);
  const [pastTheProof, setPastTheProof] = useState(false);
  const [view, setView] = useState<View>('preview');
  /** The attestation the modal is open over, with what the run was asked and answered when they are held. */
  const [shownAttestation, setShownAttestation] = useState<{ attestation: AttestationResponse; knownInput?: string; knownOutput?: string } | null>(
    null,
  );
  /** The lookup of the attestation of the run that carried the task out, asked for from a click. */
  const [runAsked, setRunAsked] = useState<{ is: 'loading' } | { is: 'failed'; said: string } | null>(null);
  /** That run held to the task, once its attestation was fetched. */
  const [carried, setCarried] = useState<Step | null>(null);
  /** The run that made a closed task, once it was fetched from a click; the proof reads it for an open task. */
  const [origin, setOrigin] = useState<Origin | null>(null);
  /** The lookup of the attestation of the run that made the task, asked for from a click. */
  const [originAsked, setOriginAsked] = useState<{ is: 'loading' } | { is: 'failed'; said: string } | null>(null);

  const read = task.read;
  const open = task.state === 'open';
  /** Approved: the owner said yes, and the run the platform started has not taken it yet; still readable, still listed. */
  const approved = task.state === 'approved';
  const now = Date.now() / 1000;

  // The proof runs for every task that still waits — open, or approved and
  // not yet taken; without a copy for this browser the hash is not held, and
  // the step that needs it waits.
  const shownHash = read?.hash ?? null;
  useEffect(() => {
    setProof(null);
    setPastTheProof(false);
    if (!(open || approved) || !token || !accountId) return;
    let cancelled = false;
    void prove<AttestationResponse>(
      {
        id: task.id,
        project_id: task.project_id,
        preparer: task.preparer,
        build: read?.envelope.build ?? null,
      },
      shownHash,
      {
      origin: () => api.taskOrigin(coordinatorUrl, token, task.id),
      attestation: (origin) => api.attestationOf<AttestationResponse>(coordinatorUrl, origin),
      verify: async (attestation) => (await import('@/lib/attestation-verify')).verifyAttestation(attestation, network),
      published: async (projectId, wasm) => {
        const version = (await viewMethod({
          contractId,
          method: 'get_version',
          args: { project_id: projectId, version_key: wasm },
        })) as { wasm_hash?: string; source?: { WasmUrl?: { hash?: string } } } | null;
        return version?.wasm_hash === wasm && version?.source?.WasmUrl?.hash === wasm;
      },
      chainOutput: async (attestation) => {
        if (!attestation.transaction_hash) return null;
        const { fetchTransaction, extractOutputFromTransaction } = await import('@/lib/near-rpc');
        const tx = await fetchTransaction(attestation.transaction_hash, attestation.caller_account_id || 'unknown', network);
        return extractOutputFromTransaction(tx, network);
      },
      sha256: async (text) => (await import('@/lib/near-rpc')).sha256(text),
      },
    ).then((found) => {
      if (!cancelled) setProof(found);
    });
    return () => {
      cancelled = true;
    };
    // viewMethod is a new function on every render of the wallet's context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, task.project_id, task.preparer, accountId, shownHash, open, approved, token, coordinatorUrl, network, contractId]);

  const proven = proof?.holds === true;
  const mayAct = proven || pastTheProof;

  /**
   * The work of one click. A string is what was done, drawn as a success; a
   * `notice` is what did not happen and is nobody's fault — the wallet did
   * not sign — drawn as neither a success nor an error; `null` says nothing.
   */
  const within = async (what: string, work: () => Promise<string | null | { notice: string }>) => {
    setBusy(what);
    setError(null);
    setNotice(null);
    try {
      const outcome = await work();
      if (outcome !== null && typeof outcome === 'object') setNotice(outcome.notice);
      else setDone(outcome);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /**
   * From a click: what the owner wrote is sealed to the task's reply key,
   * the wallet signs the approval's sentence — naming this task, the hash of
   * what this page showed and a digest of the sealed words — and the
   * coordinator starts the preparer's run, which carries the task out.
   */
  const approve = () =>
    within('approve', async () => {
      if (!accountId) throw new Error('The wallet is not connected.');
      if (!token) throw new Error('Sign in first.');
      if (!read) throw new Error('Not readable in this browser yet.');
      const supplies = read.envelope.answer_by.supplies;
      let sealed: string | null = null;
      if (supplies !== 'nothing') {
        const words = supplied.trim();
        if (!words) throw new Error(supplies === 'file' ? 'Name the file: its address and its hash.' : 'Write what is asked for.');
        sealed = toBase64(await writeReply(read.envelope, 'answer', words));
      }
      const noted = note.trim();
      const sealedNote = noted ? toBase64(await writeReply(read.envelope, 'note', noted)) : null;
      const at = Math.floor(Date.now() / 1000);
      const nonce = toBase64(globalThis.crypto.getRandomValues(new Uint8Array(32)));
      const digest = await supplyDigest(sealed, sealedNote);
      const signed = await signMessage({ message: approvalSentence(accountId, task.id, read.hash, digest, at), recipient: contractId, nonce });
      if (!signed) return { notice: 'The wallet did not sign, so nothing changed.' };
      if (signed.accountId !== accountId) throw new Error(`The wallet signed as ${signed.accountId}, not as ${accountId}.`);
      const moved = await api.approveTask(coordinatorUrl, token, task.id, {
        task_hash: read.hash,
        approval: { at, public_key: signed.publicKey, signature: signed.signature, nonce },
        ...(sealed === null ? {} : { supplied: sealed }),
        ...(sealedNote === null ? {} : { note: sealedNote }),
      });
      if (moved.state === 'failed') throw new Error(`Approved, but the run could not be started: ${failureWords(moved.failure_reason)}.`);
      return `Approved. A run of ${task.preparer} is carrying it out${moved.run ? `: call ${moved.run}` : ''}.`;
    });

  const reject = () =>
    within('reject', async () => {
      if (!token) throw new Error('Sign in first.');
      const words = reason.trim();
      const sealed = words && read ? toBase64(await writeReply(read.envelope, 'rejection', words)) : null;
      await api.rejectTask(coordinatorUrl, token, task.id, sealed);
      setRejecting(false);
      return 'Rejected.';
    });

  const remove = () =>
    within('delete', async () => {
      if (!token) throw new Error('Sign in first.');
      await api.deleteTask(coordinatorUrl, token, task.id);
      return 'Deleted.';
    });

  const silence = () =>
    within('mute', async () => {
      if (!token) throw new Error('Sign in first.');
      await api.mute(coordinatorUrl, token, { subject_is: 'agent', subject: task.preparer }, true);
      return `${task.preparer} is muted and its tasks are deleted.`;
    });

  /** From a click: one file, opened in this page and handed over as a download. */
  const download = (at: number) =>
    within(`file-${at}`, async () => {
      if (!token || !read) throw new Error('Not readable in this browser yet.');
      const note = read.envelope.files[at];
      const blob = fromBase64(await api.taskFile(coordinatorUrl, token, task.id, at));
      const bytes = await openFile(read.contentKey, task.id, at, note, blob);
      // Never the type the task names: a file is saved, not opened in the page.
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = saveName(note.name);
      link.click();
      URL.revokeObjectURL(url);
      return null;
    });

  /** From a click: the attestation of the run named by `task.run`, held to the task, then the modal over it. */
  const showRun = async (run: string) => {
    setRunAsked({ is: 'loading' });
    const door = madeBy(run);
    if (!door) {
      setRunAsked({ is: 'failed', said: 'no attestation for this run yet' });
      return;
    }
    try {
      const found = await api.attestationOf<AttestationResponse>(coordinatorUrl, door);
      if (!found) {
        setRunAsked({ is: 'failed', said: 'no attestation for this run yet' });
        return;
      }
      setRunAsked(null);
      setCarried(carriedBy({ id: task.id, project_id: task.project_id, preparer: task.preparer, build: read?.envelope.build ?? null }, run, found));
      setShownAttestation({ attestation: found });
    } catch (e) {
      setRunAsked({ is: 'failed', said: e instanceof Error ? e.message : String(e) });
    }
  };

  /**
   * From a click: the run that made the task, as the API names it, then its
   * attestation, then the modal over it with what the run was asked and
   * answered. The same lookup the proof makes for an open task.
   */
  const showOrigin = async () => {
    if (!token) {
      setOriginAsked({ is: 'failed', said: 'sign in first' });
      return;
    }
    setOriginAsked({ is: 'loading' });
    try {
      const made = origin ?? (await api.taskOrigin(coordinatorUrl, token, task.id));
      setOrigin(made);
      const found = await api.attestationOf<AttestationResponse>(coordinatorUrl, made);
      if (!found) {
        setOriginAsked({ is: 'failed', said: 'no attestation for the run that made it' });
        return;
      }
      setOriginAsked(null);
      setShownAttestation({ attestation: found, knownInput: made.input ?? undefined, knownOutput: made.output ?? undefined });
    } catch (e) {
      setOriginAsked({ is: 'failed', said: e instanceof Error ? e.message : String(e) });
    }
  };

  /** From a click: the modal over the attestation the proof read, with what the run was asked and answered. */
  const showProof = () => {
    if (!proof?.attestation) return;
    setShownAttestation({ attestation: proof.attestation, knownInput: proof.input ?? undefined, knownOutput: proof.output ?? undefined });
  };

  const size = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const tooLong = (words: string) => replyBytes(words) > MOST_REPLY_BYTES;

  const supplies = read?.envelope.answer_by.supplies ?? 'nothing';
  const operation = read?.envelope.answer_by.operation;
  /** The call that carried the task out, once there is one. */
  const run = task.run ?? null;
  /** Waiting — open, or approved — and without a copy for this browser because it arrived before this browser signed in. */
  const locked = !read && (open || approved) && task.locked;
  /** A task that did not open here for another reason has no preview and no task bytes: only the run's input. */
  const shown: View = read || locked ? view : 'input';

  return (
    <article className={`rounded-lg border bg-card p-5 ${open ? 'border-accent/50' : 'border-border'}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto min-w-0 break-words text-base font-semibold text-foreground">
          {read
            ? read.envelope.display.title
            : open || approved
              ? task.locked
                ? approved
                  ? 'A task you approved'
                  : 'A task waiting for you'
                : 'A task this page could not read'
              : `Task ${shortTaskId(task.id)}`}
        </h2>
        <Badge variant={open ? 'default' : 'outline'}>{STATE_WORDS[task.state]}</Badge>
      </header>
      {task.failure_reason !== undefined && (
        <p className="mt-1 text-xs text-destructive-text">Failed: {failureWords(task.failure_reason)}.</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          From agent <AgentChip account={task.preparer} />
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Via <span className="break-all font-mono text-foreground">{task.project_id}</span>
        </span>
        <span aria-hidden="true">·</span>
        <span title={open ? waits(task.expires_at, now) : undefined}>{made(task.created_at)}</span>
      </div>
      {!open && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            {origin ? (
              <>
                Made by run <span className="break-all font-mono text-foreground">{origin.run}</span>
              </>
            ) : (
              'Made by a run'
            )}
          </span>
          <span aria-hidden="true">·</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => void showOrigin()}
            disabled={originAsked?.is === 'loading'}
          >
            {originAsked?.is === 'loading' ? 'attestation…' : 'attestation'}
          </Button>
          {originAsked?.is === 'failed' && <span className="text-muted-foreground">{originAsked.said}</span>}
        </div>
      )}
      {run && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            Carried out by call <span className="break-all font-mono text-foreground">{run}</span>
          </span>
          <span aria-hidden="true">·</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => void showRun(run)}
            disabled={runAsked?.is === 'loading'}
          >
            {runAsked?.is === 'loading' ? 'attestation…' : 'attestation'}
          </Button>
          {runAsked?.is === 'failed' && <span className="text-muted-foreground">{runAsked.said}</span>}
          {carried && (
            <span className={carried.ok ? 'text-success-text' : 'text-destructive-text'}>
              {carried.ok ? 'Holds. ' : 'Does not hold. '}
              {carried.said}
            </span>
          )}
        </div>
      )}

      {(read || open) && (
        <section className="mt-4 rounded-md border border-accent/40 bg-accent/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">
                {read ? (
                  <>
                    Prepared by <span className="break-all font-mono">{task.project_id}</span> from what agent{' '}
                    <AgentChip account={task.preparer} className="font-normal" /> {asks(read.envelope.kind)}
                  </>
                ) : locked ? (
                  <>
                    Prepared by <span className="break-all font-mono">{task.project_id}</span> for you
                  </>
                ) : (
                  'The run that made it'
                )}
              </h3>
              {read && <p className="mt-1 text-xs text-muted-foreground">{PROVENANCE_LEGEND}</p>}
            </div>
            <ViewSwitch view={shown} readable={read !== null} locked={locked} onChange={setView} />
          </div>
          {shown === 'preview' && read ? (
            <div className="mt-3 space-y-3">
              {read.envelope.display.fields.map((field, at) => (
                <Field key={at} field={field} />
              ))}
            </div>
          ) : shown === 'preview' && locked ? (
            <div role="alert" className="mt-3 space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
              <p className="font-semibold text-destructive-text">Not readable in this browser yet</p>
              <p>
                This task arrived before you signed in here, so it is encrypted for other browsers only. Use &ldquo;Make it
                readable here&rdquo; at the top of the inbox: one transaction, then the task opens.
              </p>
            </div>
          ) : shown === 'task' && read ? (
            <div className="mt-3">
              <RawBytes
                about="The form exactly as its hash covers it."
                text={read.document}
                hash={read.hash}
                says="SHA-256 of these bytes, the hash your approval names:"
              />
            </div>
          ) : (
            <div className="mt-3">
              <RawInput proof={proof} />
            </div>
          )}
        </section>
      )}

      {read && read.envelope.files.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Files that go with it. Each is handed over as a download for you to open; this page opens none of them.
          </p>
          <ul className="space-y-2">
            {read.envelope.files.map((file, at) => (
              <li key={at} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm">
                <span className="min-w-0 flex-1 break-all text-foreground">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {file.content_type} · {size(file.size)}
                </span>
                {open && (
                  <Button variant="outline" size="sm" onClick={() => void download(at)} disabled={busy !== null}>
                    {busy === `file-${at}` ? 'Opening…' : 'Save to open'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(open || approved) && (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            proof === null
              ? 'border-border text-muted-foreground'
              : proven
                ? 'border-success/30 bg-success/10 text-success-text'
                : proof.unchecked
                  ? 'border-info/30 bg-info/10 text-foreground'
                  : 'border-destructive/30 bg-destructive/10 text-destructive-text'
          }`}
        >
          <p>{proof === null ? 'Checking that a published build of the project made this task…' : verdict(proof)}</p>
          {proof !== null && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs">The proof, step by step</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
                {proof.steps.map((step) => (
                  <li key={step.name}>
                    {step.ok === true ? 'Holds. ' : step.ok === false ? 'Does not hold. ' : 'Not checked. '}
                    {step.said}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {proof?.attestation && (
            <Button variant="outline" size="sm" className="mt-2" onClick={showProof}>
              Show the attestation
            </Button>
          )}
          {read && open && proof !== null && !proven && (
            <label className="mt-3 flex items-start gap-2 text-xs">
              <input type="checkbox" checked={pastTheProof} onChange={(e) => setPastTheProof(e.target.checked)} className="mt-0.5" />
              <span>
                Approve without the proof. The project still refuses an approval of a task it did not make: what it
                acts on is the task sealed in the enclave, and the hash shown under RAW form above must be that task&apos;s.
              </span>
            </label>
          )}
        </div>
      )}

      {shownAttestation && (
        <AttestationModal
          jobId={shownAttestation.attestation.task_id}
          isHttpsCall={Boolean(shownAttestation.attestation.call_id)}
          attestation={shownAttestation.attestation}
          network={network}
          knownInput={shownAttestation.knownInput}
          knownOutput={shownAttestation.knownOutput}
          onClose={() => setShownAttestation(null)}
        />
      )}

      {locked && approved && (
        <p className="mt-4 rounded-md border border-border p-3 text-sm text-muted-foreground">
          You approved this task from another browser, and it is being carried out. It is encrypted for other
          browsers only; the proof and the form open here after &ldquo;Make it readable here&rdquo; at the top of the inbox.
        </p>
      )}

      {!read && !task.locked && task.unread && (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
          This task did not open here ({task.unread}). It is not shown and cannot be answered from this page; delete
          it, or ask the agent to prepare it again.
        </p>
      )}

      {read && open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {supplies !== 'nothing' && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">
                {supplies === 'file'
                  ? 'The file, as an address and its hash. The file itself is not uploaded from here.'
                  : 'Your answer'}
              </span>
              <textarea
                value={supplied}
                onChange={(e) => !tooLong(e.target.value) && setSupplied(e.target.value)}
                rows={supplies === 'file' ? 2 : 4}
                className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
              />
            </label>
          )}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">
              A note for the agent, if you want to give one. It is encrypted in this page; the connector reads it
              with your approval.
            </span>
            <textarea
              value={note}
              onChange={(e) => !tooLong(e.target.value) && setNote(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Approving signs one message with your wallet: no transaction, nothing attached. The message names this
            task&apos;s id and hash{supplies === 'nothing' && !note.trim() ? '' : ', and what you wrote above, encrypted for the project'}.
            A run of <AgentChip account={task.preparer} /> then carries it out, paid by the agent: one call of{' '}
            <span className="font-mono text-foreground">{operation}</span> in{' '}
            <span className="font-mono text-foreground">{task.project_id}</span>, which does what the task describes,
            under your policy as it is now, and nothing else. Reject below if you do not want it done.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void approve()} disabled={busy !== null || !mayAct}>
              {busy === 'approve'
                ? 'Waiting for the wallet…'
                : task.kind === 'confirm'
                  ? `Approve: ${task.preparer} runs ${operation}`
                  : `Answer: ${task.preparer} runs ${operation}`}
            </Button>
            <Button variant="outline" onClick={() => setRejecting((was) => !was)} disabled={busy !== null}>
              Reject
            </Button>
          </div>
          {rejecting && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">
                  A reason for the agent, if you want to give one. It is encrypted in this page; the agent reads it
                  the next time it asks.
                </span>
                <textarea
                  value={reason}
                  onChange={(e) => !tooLong(e.target.value) && setReason(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground"
                />
              </label>
              <Button variant="destructive" size="sm" onClick={() => void reject()} disabled={busy !== null}>
                {busy === 'reject' ? 'Rejecting…' : 'Reject this task'}
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">{error}</p>
      )}
      {done && !error && (
        <p className="mt-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success-text">{done}</p>
      )}
      {notice && !error && (
        <p className="mt-4 rounded-md border border-border p-3 text-sm text-muted-foreground">{notice}</p>
      )}

      <footer className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy !== null}>
          {busy === 'delete' ? 'Deleting…' : 'Delete'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void silence()} disabled={busy !== null}>
          {busy === 'mute' ? 'Muting…' : 'Mute this agent and delete its tasks'}
        </Button>
        <span className="ml-auto self-center break-all font-mono text-xs text-faint-foreground">{task.id}</span>
      </footer>
    </article>
  );
}
