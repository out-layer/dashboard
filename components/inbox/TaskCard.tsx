'use client';

/**
 * One task, drawn from its envelope. The page supplies the layout; the task
 * supplies words, and every one of them is drawn as text: nothing a task
 * carries is markup, a link, an image or an address to load.
 *
 * Reading, rejecting, deleting and muting are the session's. Acting is one
 * call of the project that made the task, signed by the owner's wallet from
 * the button that says what the call does.
 *
 * For every open task the page checks the proof (`lib/inbox/proof`): that
 * the task was made by a published build of its project, in an approved
 * enclave, and that what that run answered names this task with the hash of
 * what is shown. A proof that does not hold, or could not be checked, is said
 * in its place, and the owner answers past it only by saying so.
 *
 * A task made before this browser signed in is `locked`: it holds no copy
 * for this browser, so nothing of it is shown and nothing can be answered.
 * The proof still runs, up to the hash. The inbox page offers, per project,
 * the one transaction that makes such tasks readable here.
 */

import { useEffect, useState } from 'react';
import AttestationModal from '@/components/AttestationModal';
import type { AttestationResponse } from '@/lib/api';
import { prove, verdict, type Proof } from '@/lib/inbox/proof';
import { actionCreators } from '@near-js/transactions';
import { Badge } from '@/components/ui/badge';
import { AgentChip } from '@/components/ui/agent-chip';
import { Button } from '@/components/ui/button';
import { HashChip } from '@/components/ui/hash-chip';
import { useNearWallet } from '@/contexts/NearWalletContext';
import { useInbox, type ShownTask } from '@/contexts/InboxContext';
import * as api from '@/lib/inbox/api';
import { CALL_DEPOSIT, CALL_GAS, answerInput, callOf, readAnswer, waits } from '@/lib/inbox/act';
import { MOST_REPLY_BYTES, fromBase64, openFile, replyBytes, saveName, toBase64, writeReply, type TaskField } from '@/lib/inbox/crypto';

const STATE_WORDS: Record<ShownTask['state'], string> = {
  open: 'Needs your answer',
  answering: 'Being acted on',
  done: 'Done',
  failed: 'Failed',
  rejected: 'Rejected',
  cancelled: 'Withdrawn by the agent',
  expired: 'Expired',
  void: 'Void: the policy changed',
  unknown: 'In a state this page does not know',
};

function Field({ field }: { field: TaskField }) {
  const byAgent = field.written_by === 'agent';
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr]">
      <dt className="text-sm text-muted-foreground">
        {field.label}
        <span className="ml-2 text-xs text-faint-foreground">{byAgent ? 'written by the agent' : 'from the project'}</span>
      </dt>
      <dd className="min-w-0 text-sm text-foreground">
        {field.kind === 'list' ? (
          <ul className="space-y-0.5">
            {field.values.map((value, at) => (
              <li key={at} className="break-words">
                {value}
              </li>
            ))}
          </ul>
        ) : (
          <span
            className={
              field.kind === 'long_text'
                ? 'block max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-card-muted p-3'
                : field.kind === 'money'
                  ? 'font-semibold tabular-nums'
                  : field.kind === 'account' || field.kind === 'address'
                    ? 'break-all font-mono'
                    : 'break-words'
            }
          >
            {field.values[0] ?? ''}
          </span>
        )}
      </dd>
    </div>
  );
}

export function TaskCard({ task }: { task: ShownTask }) {
  const { accountId, contractId, network, viewMethod, signAndSendTransaction } = useNearWallet();
  const { token, coordinatorUrl, refresh } = useInbox();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [supplied, setSupplied] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [proof, setProof] = useState<Proof<AttestationResponse> | null>(null);
  const [showAttestation, setShowAttestation] = useState(false);
  const [pastTheProof, setPastTheProof] = useState(false);

  const read = task.read;
  const open = task.state === 'open';
  const now = Date.now() / 1000;

  // The proof runs for every open task; without a copy for this browser the
  // hash is not held, and the step that needs it waits.
  const shownHash = read?.hash ?? null;
  useEffect(() => {
    setProof(null);
    setPastTheProof(false);
    if (!open || !token) return;
    let cancelled = false;
    void prove<AttestationResponse>(
      { id: task.id, project_id: task.project_id, preparer: task.preparer, build: read?.envelope.build ?? null },
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
  }, [task.id, task.project_id, task.preparer, shownHash, open, token, coordinatorUrl, network, contractId]);

  const proven = proof?.holds === true;
  const mayAct = proven || pastTheProof;

  const within = async (what: string, work: () => Promise<string | null>) => {
    setBusy(what);
    setError(null);
    try {
      setDone(await work());
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  /** One call of the project, signed by the wallet. */
  const call = async (input: Record<string, unknown>) => {
    if (!accountId) throw new Error('The wallet is not connected.');
    if (!read) throw new Error('Not readable in this browser yet.');
    const outcome = await signAndSendTransaction({
      receiverId: contractId,
      actions: [
        actionCreators.functionCall(
          'request_execution',
          callOf(task.project_id, accountId, task.profile, read.envelope.build, input),
          CALL_GAS,
          CALL_DEPOSIT,
        ),
      ],
    });
    const answer = readAnswer(outcome as { status?: { SuccessValue?: string } });
    if (!answer.ok) throw new Error(answer.refusal);
    return answer.output;
  };

  const act = () =>
    within('act', async () => {
      if (!read) throw new Error('Not readable in this browser yet.');
      const supplies = read.envelope.answer_by.supplies;
      let sealed: string | null = null;
      if (supplies !== 'nothing') {
        const words = supplied.trim();
        if (!words) throw new Error(supplies === 'file' ? 'Name the file: its address and its hash.' : 'Write what is asked for.');
        sealed = toBase64(await writeReply(read.envelope, 'answer', words));
      }
      await call(answerInput(read.envelope, read.hash, sealed));
      return 'The project acted on your answer.';
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

  const size = (bytes: number) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  const tooLong = (words: string) => replyBytes(words) > MOST_REPLY_BYTES;

  const supplies = read?.envelope.answer_by.supplies ?? 'nothing';
  const operation = read?.envelope.answer_by.operation;

  return (
    <article className={`rounded-lg border bg-card p-5 ${open ? 'border-accent/50' : 'border-border'}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto min-w-0 break-words text-base font-semibold text-foreground">
          {read ? read.envelope.display.title : task.locked ? 'A task waiting for you' : 'A task this page could not read'}
        </h2>
        <Badge variant={open ? 'default' : 'outline'}>{STATE_WORDS[task.state]}</Badge>
      </header>

      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div className="flex flex-wrap items-center gap-1">
          From agent <AgentChip account={task.preparer} />
        </div>
        <div>
          Via <span className="break-all font-mono text-foreground">{task.project_id}</span>
        </div>
        <div>{open ? waits(task.expires_at, now) : new Date(task.created_at * 1000).toLocaleString()}</div>
        {task.run && (
          <div>
            Carried out by call <span className="break-all font-mono text-foreground">{task.run}</span>
          </div>
        )}
      </dl>

      {!read && task.locked && open && (
        <p className="mt-2 text-sm text-muted-foreground">Arrived before you signed in here. Make it readable with the button above.</p>
      )}

      {read && (
        <dl className="mt-4 space-y-3 border-t border-border pt-4">
          {read.envelope.display.fields.map((field, at) => (
            <Field key={at} field={field} />
          ))}
        </dl>
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

      {read && (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          The hash your answer names, of exactly what is shown above{read.envelope.files.length > 0 ? ' and of its files' : ''}:
          <HashChip value={read.hash} />
        </p>
      )}

      {open && (
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
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowAttestation(true)}>
              Show the attestation
            </Button>
          )}
          {read && proof !== null && !proven && (
            <label className="mt-3 flex items-start gap-2 text-xs">
              <input type="checkbox" checked={pastTheProof} onChange={(e) => setPastTheProof(e.target.checked)} className="mt-0.5" />
              <span>
                Answer without the proof. The project still refuses an answer to a task it did not make: what it
                acts on is the task sealed in the enclave, and the hash below must be that task&apos;s.
              </span>
            </label>
          )}
        </div>
      )}

      {showAttestation && proof?.attestation && (
        <AttestationModal
          jobId={proof.attestation.task_id}
          isHttpsCall={Boolean(proof.attestation.call_id)}
          attestation={proof.attestation}
          network={network}
          knownOutput={proof.output ?? undefined}
          onClose={() => setShowAttestation(false)}
        />
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
          <p className="text-sm text-muted-foreground">
            Your answer is one call of <span className="font-mono text-foreground">{operation}</span> in{' '}
            <span className="font-mono text-foreground">{task.project_id}</span>, signed by your wallet: one
            transaction, 0.1 NEAR attached and refunded less the run&apos;s cost. It carries this task&apos;s id and
            hash{supplies === 'nothing' ? '' : ', and what you wrote above, encrypted for the project'}. The
            project&apos;s code then does what the task describes, under your policy as it is now.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void act()} disabled={busy !== null || !mayAct}>
              {busy === 'act'
                ? 'Waiting for the wallet…'
                : task.kind === 'confirm'
                  ? `Confirm: run ${operation}`
                  : `Answer: run ${operation}`}
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
