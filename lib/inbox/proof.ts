/**
 * The proof that a task was made by a published build of its project.
 *
 * Four facts, each held by somebody else than the platform's database:
 *
 *   1. the attestation of the run that made the task is a quote Intel signed,
 *      from an enclave whose measurements are approved on chain, and it
 *      commits to the fields it is published with (`lib/attestation-verify`);
 *   2. the build that ran is a version of the task's project on the contract;
 *   3. what the run answered hashes to the attestation's `output_hash`;
 *   4. that answer names this task and the hash of what this page opened.
 *
 * So what is shown is what a published build of the project made, and not
 * something written into the store. The steps are reported one by one: a step
 * that could not be run — the chain or the API did not answer — is "not
 * checked", which is a different claim from "does not hold".
 */

/** The run that made a task, as `GET /inbox/tasks/{id}/origin` answers. */
export type Origin = {
  run: string;
  door: 'https' | 'chain';
  call_id?: string;
  request_id?: number;
  output: string | null;
};

/** What the proof reads of an attestation. */
export type Attested = {
  task_id: number;
  output_hash: string;
  project_id?: string;
  executed_wasm_sha256?: string;
  call_id?: string;
  request_id?: number;
  payment_key_owner?: string;
  caller_account_id?: string;
  transaction_hash?: string;
};

/** What the proof reads of a verification. */
export type Verified = {
  authenticity: { ok: boolean; status?: string; error?: string };
  identity: { ok: boolean; checked: boolean; error?: string };
  binding: { ok: boolean; checked: boolean };
};

export type StepName = 'attestation' | 'enclave' | 'run' | 'build' | 'answer' | 'task';

export type Step = {
  name: StepName;
  /** `true` holds, `false` does not hold, `null` could not be checked. */
  ok: boolean | null;
  said: string;
};

export type Proof<A extends Attested = Attested> = {
  /** Every step holds. */
  holds: boolean;
  /** No step failed, and at least one could not be checked. */
  unchecked: boolean;
  steps: Step[];
  attestation: A | null;
  /** The run's answer, when it was read. */
  output: string | null;
};

/** `build`: the build the envelope names, `null` while the task is not open on this device. */
export type Task = { id: string; project_id: string; preparer: string; build: string | null };

export type Deps<A extends Attested> = {
  origin: () => Promise<Origin>;
  /** The run's attestation, or `null` when it has none. */
  attestation: (origin: Origin) => Promise<A | null>;
  verify: (attestation: A) => Promise<Verified>;
  /** Is this build a version of the project on the contract, published as a wasm? */
  published: (projectId: string, wasmSha256: string) => Promise<boolean>;
  /** The answer of a run on chain, read off its transaction. */
  chainOutput: (attestation: A) => Promise<string | null>;
  sha256: (text: string) => Promise<string>;
};

/**
 * Does `output` — a run's answer — name the task `id` with the hash `hash`?
 * Anywhere in it: a project puts what `awaiting_owner` answers where its own
 * answer has room for it, and a turn puts the next task beside its result.
 */
export function namesTask(output: string, id: string, hash: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
    // An answer that was stored as a JSON string of JSON.
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  } catch {
    return false;
  }
  const within = (value: unknown, depth: number): boolean => {
    if (depth > 16 || typeof value !== 'object' || value === null) return false;
    if (Array.isArray(value)) return value.some((entry) => within(entry, depth + 1));
    const object = value as Record<string, unknown>;
    if (object.task_id === id && typeof object.task_hash === 'string' && object.task_hash.toLowerCase() === hash.toLowerCase()) {
      return true;
    }
    return Object.values(object).some((entry) => within(entry, depth + 1));
  };
  return within(parsed, 0);
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Run the proof. Never throws: what could not be asked is a step not checked. */
export async function prove<A extends Attested>(task: Task, hash: string, deps: Deps<A>): Promise<Proof<A>> {
  const steps: Step[] = [];
  const done = (attestation: A | null, output: string | null): Proof<A> => ({
    holds: steps.length === 6 && steps.every((s) => s.ok === true),
    unchecked: !steps.some((s) => s.ok === false) && (steps.some((s) => s.ok === null) || steps.length < 6),
    steps,
    attestation,
    output,
  });

  let origin: Origin;
  let attestation: A | null;
  try {
    origin = await deps.origin();
    attestation = await deps.attestation(origin);
  } catch (e) {
    steps.push({ name: 'attestation', ok: null, said: `The run's attestation could not be read: ${message(e)}` });
    return done(null, null);
  }
  if (!attestation) {
    steps.push({ name: 'attestation', ok: false, said: `The run ${origin.run} that made this task has no attestation.` });
    return done(null, origin.output);
  }
  steps.push({ name: 'attestation', ok: true, said: `The run ${origin.run} is attested.` });

  try {
    const verified = await deps.verify(attestation);
    if (!verified.authenticity.ok) {
      const said = verified.authenticity.error ?? 'the quote did not verify';
      // A verifier or collateral that could not be loaded is not a quote that failed.
      const unread = /could not|failed to load|fetch|network|collateral/i.test(said) && !/signature|mismatch|invalid/i.test(said);
      steps.push({ name: 'enclave', ok: unread ? null : false, said: `The enclave's quote: ${said}.` });
    } else if (!verified.binding.checked || !verified.identity.checked) {
      steps.push({
        name: 'enclave',
        ok: null,
        said: `The quote is Intel's, and the rest could not be checked: ${verified.identity.error ?? 'the contract did not answer'}.`,
      });
    } else if (!verified.binding.ok) {
      steps.push({ name: 'enclave', ok: false, said: 'The quote does not commit to the fields the attestation is published with.' });
    } else if (!verified.identity.ok) {
      steps.push({ name: 'enclave', ok: false, said: 'The enclave that ran it is not a build approved on chain.' });
    } else {
      steps.push({ name: 'enclave', ok: true, said: `An approved enclave ran it (Intel's status: ${verified.authenticity.status ?? 'unknown'}).` });
    }
  } catch (e) {
    steps.push({ name: 'enclave', ok: null, said: `The quote could not be verified: ${message(e)}` });
  }

  const sameRun =
    origin.door === 'https'
      ? attestation.call_id === origin.call_id && (attestation.payment_key_owner ?? task.preparer) === task.preparer
      : attestation.request_id === origin.request_id && (attestation.caller_account_id ?? task.preparer) === task.preparer;
  if (attestation.project_id !== task.project_id) {
    steps.push({ name: 'run', ok: false, said: `The attested run was of ${attestation.project_id ?? 'no project'}, not of ${task.project_id}.` });
  } else if (!sameRun) {
    steps.push({ name: 'run', ok: false, said: `The attested run is not the run ${origin.run} made by ${task.preparer}.` });
  } else {
    steps.push({ name: 'run', ok: true, said: `It was a run of ${task.project_id}, made by ${task.preparer}.` });
  }

  if (!attestation.executed_wasm_sha256) {
    steps.push({ name: 'build', ok: false, said: 'The attestation does not name the build that ran.' });
  } else if (task.build !== null && task.build.toLowerCase() !== attestation.executed_wasm_sha256.toLowerCase()) {
    // The task names the build that made it, and the answer runs that build:
    // an attestation of another build proves another run.
    steps.push({ name: 'build', ok: false, said: 'The build the task names is not the build the attested run was of.' });
  } else {
    try {
      const published = await deps.published(task.project_id, attestation.executed_wasm_sha256);
      steps.push({
        name: 'build',
        ok: published,
        said: published
          ? `The build that ran is a published version of ${task.project_id}.`
          : `The build that ran is not a version of ${task.project_id} on the contract.`,
      });
    } catch (e) {
      steps.push({ name: 'build', ok: null, said: `The contract could not be asked about the build: ${message(e)}` });
    }
  }

  let output = origin.output;
  if (output === null && origin.door === 'chain') {
    try {
      output = await deps.chainOutput(attestation);
    } catch (e) {
      steps.push({ name: 'answer', ok: null, said: `The run's transaction could not be read: ${message(e)}` });
      return done(attestation, null);
    }
  }
  if (output === null) {
    steps.push({ name: 'answer', ok: false, said: 'What the run answered is not kept, so it cannot be held to the attestation.' });
    return done(attestation, null);
  }
  const answered = (await deps.sha256(output)) === attestation.output_hash;
  steps.push({
    name: 'answer',
    ok: answered,
    said: answered ? "What the run answered is what the enclave signed for." : "What the run answered does not hash to the attestation's output hash.",
  });

  const named = namesTask(output, task.id, hash);
  steps.push({
    name: 'task',
    ok: named,
    said: named
      ? 'That answer names this task, with the hash of exactly what is shown here.'
      : 'That answer does not name this task with the hash of what is shown here.',
  });
  return done(attestation, output);
}

/** The proof in one line. */
export function verdict(proof: Proof): string {
  if (proof.holds) return 'Made by a published build of the project, in an approved enclave.';
  const failed = proof.steps.find((s) => s.ok === false);
  if (failed) return `The proof does not hold. ${failed.said}`;
  const unread = proof.steps.find((s) => s.ok === null);
  return `The proof could not be checked. ${unread?.said ?? ''}`.trim();
}
