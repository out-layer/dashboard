/**
 * Acting on a task: the owner's own call of the project that made it.
 *
 * A task names the operation that answers it and the build that made it,
 * and nothing else. The call is that operation of that project, of that
 * build, with the task's id, the hash of what this page showed, and what the
 * owner supplied, sealed to the task's reply key. The project's code decides
 * what happens; the host refuses the answer in a run of another build.
 */

import type { TaskState } from './api';
import type { Envelope } from './crypto';

/** The gas and the deposit of one call of a project from the owner's wallet. */
export const CALL_GAS = BigInt('300000000000000');
export const CALL_DEPOSIT = BigInt('100000000000000000000000');

const LIMITS = { max_instructions: 10000000000, max_memory_mb: 128, max_execution_seconds: 60 };

/**
 * The arguments of `request_execution` for one call of a project's operation
 * on the owner's row. `build` names the version to run: the one the task was
 * made by, which the proof checked, and which the host holds the answer to.
 */
export function callOf(projectId: string, owner: string, profile: string, build: string, input: Record<string, unknown>) {
  return {
    source: { Project: { project_id: projectId, version_key: build } },
    resource_limits: LIMITS,
    input_data: JSON.stringify(input),
    response_format: 'Json',
    secrets_ref: { account_id: owner, profile },
  };
}

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

/** What the owner's answer to a task sends the project. */
export function answerInput(envelope: Envelope, hash: string, supplied: string | null): Record<string, unknown> {
  const input: Record<string, unknown> = {
    operation: envelope.answer_by.operation,
    task_id: envelope.id,
    task_hash: hash,
  };
  if (supplied !== null) input.supplied = supplied;
  return input;
}

export type Answered =
  | { ok: true; output: unknown }
  | { ok: false; refusal: string };

/** The project's answer, read off the transaction's outcome. */
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

/** What the framed form asks of the owner, by the task's kind. */
export function asks(kind: Envelope['kind']): string {
  return kind === 'confirm' ? 'What the agent asks you to approve' : 'What the agent asks you for';
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

/** The heading of a task that is no longer open: what became of it, by its state. */
export function closedHeading(state: Exclude<TaskState, 'open'> | 'unknown'): string {
  switch (state) {
    case 'answering':
      return 'A task being carried out';
    case 'done':
      return 'A task carried out';
    case 'rejected':
      return 'A task you rejected';
    case 'cancelled':
      return 'A task the agent cancelled';
    case 'expired':
      return 'A task that expired';
    case 'failed':
      return 'A task whose run failed';
    case 'void':
      return 'A task voided by a newer build';
    case 'unknown':
      return 'A closed task';
    default: {
      const unmet: never = state;
      return unmet;
    }
  }
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
