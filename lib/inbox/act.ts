/**
 * Acting on a task: the owner approves, and the agent's run carries it out.
 *
 * A task names the operation that answers it and the build that made it,
 * and nothing else. The owner signs one sentence with their wallet (NEP-413,
 * recipient: the OutLayer contract) naming the task, the hash of what this
 * page showed and a digest of what the owner supplied, each sealed to the
 * task's reply key. The platform then starts a run of the agent that
 * prepared the task — on the agent's own payment key, within the preparing
 * run's compute limit — which executes the operation; the owner's wallet
 * sends no transaction. The project's code decides what happens; the host
 * refuses the answer in a run of another build or of another account.
 */

import type { Envelope, TaskField } from './crypto';

/** The gas and the deposit of one call of a project from the owner's wallet. */
export const CALL_GAS = BigInt('300000000000000');
export const CALL_DEPOSIT = BigInt('100000000000000000000000');

const LIMITS = { max_instructions: 10000000000, max_memory_mb: 128, max_execution_seconds: 60 };

/**
 * The arguments of `request_execution` for one call of a project's
 * `tasks_unlock` on the owner's row: it writes, for the browsers signed in to
 * the inbox now, the copies of every task of the project that waits for the
 * owner, and nothing else. It runs the project's active version: the tasks it
 * opens belong to the project, not to the build that made each, and every
 * build serves the operation.
 */
export function unlockCall(projectId: string, owner: string, profile: string) {
  return {
    source: { Project: { project_id: projectId } },
    resource_limits: LIMITS,
    input_data: JSON.stringify({ operation: 'tasks_unlock' }),
    response_format: 'Json',
    secrets_ref: { account_id: owner, profile },
  };
}

/** A moment in the sentence the wallet signs: to the second, in UTC. */
function moment(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The sentence the owner's wallet signs to approve one task (NEP-413,
 * recipient: the OutLayer contract), good for ten minutes, once. The
 * coordinator and the enclave each rebuild it from what they hold — the
 * session's account, the task's id, the hash of the envelope, the digest of
 * the sealed supply and note, the time — and compare bytes; nothing parses
 * it.
 */
export function approvalSentence(owner: string, id: string, hash: string, digest: string, at: number): string {
  return `Approve in OutLayer as ${owner}: task ${id} with hash ${hash} and supply ${digest}. At ${moment(at)}.`;
}

/**
 * The digest the sentence names of what the owner said: SHA-256, hex, of the
 * canonical JSON `{"note":<base64|null>,"supplied":<base64|null>}` — members
 * in that order, no whitespace — where each is the sealed bytes as base64,
 * or `null` when there are none. Nothing said is still a digest, so the
 * sentence has one shape. The sealed bytes are under the owner's signature
 * because anyone can seal to the reply key; the owner's words must be the
 * owner's.
 */
export async function supplyDigest(sealedSupplied: string | null, sealedNote: string | null): Promise<string> {
  const canonical = JSON.stringify({ note: sealedNote, supplied: sealedSupplied });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Why a task ended `failed`, in words: the reason the API gives, as
 * `failure_reason`. The run the platform started for it was refused at the
 * door, never started, or refused the task when it ran.
 */
export function failureWords(reason: string | null | undefined): string {
  switch (reason) {
    case undefined:
    case null:
      return 'the run did not finish the task';
    case 'preparer_key_unavailable':
      return "the agent's payment key could not pay for the run";
    case 'operation_priced':
      return 'the operation is priced, and an approved run pays nothing';
    case 'operation_unknown':
      return 'the operation is not sold by the project any more';
    case 'operation_limit_reached':
      return "the operation's limit for the agent's key is reached";
    case 'wallet_unresolved':
      return "the agent's wallet could not be resolved";
    case 'queue_unavailable':
      return 'the run could not be queued';
    case 'run_not_started':
      return 'no worker started the run in time';
  }
  if (reason.startsWith('run_refused:')) {
    const why = reason.slice('run_refused:'.length);
    switch (why) {
      case 'hash-mismatch':
        return 'the task the run holds is not the one you approved';
      case 'answer-invalid':
        return "the run's answer did not name the task";
      case 'not-the-preparer':
        return 'the run was not of the agent that prepared the task';
      case 'approval-invalid':
        return 'your approval did not verify in the enclave';
      case 'expired':
        return 'the task expired before the run acted';
      case 'void':
        return 'the policy changed since the task was made';
      case 'unreported':
        return 'the run ended without reporting what it did';
      case 'unavailable':
        return 'the run could not reach the store or the chain';
      case 'not-found':
        return 'the run found no such task';
      default:
        return `the run refused the task (${why})`;
    }
  }
  return reason;
}

export type Answered =
  | { ok: true; output: unknown }
  | { ok: false; refusal: string };

/** The project's answer to `tasks_unlock`, read off the transaction's outcome. */
export function readAnswer(outcome: { status?: { SuccessValue?: string; Failure?: unknown } } | null | undefined): Answered {
  const returned = outcome?.status?.SuccessValue;
  if (typeof returned !== 'string' || returned === '') {
    return { ok: false, refusal: 'The transaction finished without an answer from the project.' };
  }
  let answer: unknown;
  try {
    answer = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(returned), (c) => c.charCodeAt(0))));
    if (typeof answer === 'string') answer = JSON.parse(answer);
  } catch {
    return { ok: false, refusal: 'The project answered with something that is not JSON.' };
  }
  const parsed = answer as { success?: unknown; error?: unknown; output?: unknown } | null;
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, refusal: 'The project answered with something that is not an answer.' };
  }
  if (parsed.success !== true) {
    return { ok: false, refusal: typeof parsed.error === 'string' && parsed.error ? parsed.error : 'The project refused the call.' };
  }
  return { ok: true, output: parsed.output ?? null };
}

/**
 * The end of the sentence that heads the form, by the task's kind: `Prepared
 * by <project> from what agent <preparer> …`. A confirmation is what the
 * agent asked; an input task is what it asks the owner for.
 */
export function asks(kind: Envelope['kind']): string {
  return kind === 'confirm' ? 'asked' : 'asks you for';
}

/** The mark drawn inside a field of the form, and its words, by who wrote the field. */
export function provenance(writtenBy: TaskField['written_by']): { mark: string; title: string } {
  return writtenBy === 'agent' ? { mark: '🤖', title: 'written by the agent' } : { mark: '⚙', title: 'filled in by the connector' };
}

/** The legend under the form's heading: each mark and its words. */
export const PROVENANCE_LEGEND = `${provenance('agent').mark} ${provenance('agent').title} · ${provenance('project').mark} ${provenance('project').title}`;

/** How many rows a read-only text area is given for `lines` lines of content: at least `least`, at most 12. */
export function rowsOf(lines: number, least = 3): number {
  return Math.min(12, Math.max(least, lines));
}

/** The lines of a text, as a text area shows them. */
export function linesOf(text: string): number {
  return text.split('\n').length;
}

/** When a task was made, in the browser's own words. */
export function made(createdAt: number): string {
  return `made ${new Date(createdAt * 1000).toLocaleString()}`;
}

/** How long a task still waits, in words. */
export function waits(expiresAt: number, now: number): string {
  const left = expiresAt - now;
  if (left <= 0) return 'past its life';
  if (left < 3600) return `${Math.max(1, Math.round(left / 60))} min left`;
  return `${Math.round(left / 3600)} h left`;
}

/**
 * The first characters of a task's id, enough to tell one task from another
 * on a page: the heading of a task whose content this page does not show.
 */
export function shortTaskId(id: string): string {
  return id.slice(0, 8);
}

/** The door a run came through, read off its id, as the coordinator reads it: `req-<n>` for a request on chain, the call's id otherwise. */
export type RunDoor = { door: 'chain'; request_id: number } | { door: 'https'; call_id: string };

/**
 * `madeBy(run)`: the door of the run named `run`, or `null` for an id that
 * names neither a request on chain nor a call. The check is the coordinator's
 * own: `req-` and a number is a request; anything else is asked for as a
 * call, and the coordinator says whether one exists.
 */
export function madeBy(run: string): RunDoor | null {
  if (run.startsWith('req-')) {
    const number = run.slice(4);
    return /^\d+$/.test(number) && Number.isSafeInteger(Number(number)) ? { door: 'chain', request_id: Number(number) } : null;
  }
  return run === '' ? null : { door: 'https', call_id: run };
}
