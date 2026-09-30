/**
 * Acting on a task: the owner's own call of the project that made it.
 *
 * A task names the operation that answers it and the build that made it,
 * and nothing else. The call is that operation of that project, of that
 * build, with the task's id, the hash of what this page showed, and what the
 * owner supplied, sealed to the task's reply key. The project's code decides
 * what happens; the host refuses the answer in a run of another build.
 */

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

/** How long a task still waits, in words. */
export function waits(expiresAt: number, now: number): string {
  const left = expiresAt - now;
  if (left <= 0) return 'past its life';
  if (left < 3600) return `${Math.max(1, Math.round(left / 60))} min left`;
  return `${Math.round(left / 3600)} h left`;
}
