/**
 * The proof that a task was made by a published build of its project.
 *
 * Five facts, each held by somebody else than the platform's database:
 *
 *   1. the attestation of the run that made the task is a quote Intel signed,
 *      from an enclave whose measurements are approved on chain, and it
 *      commits to the fields it is published with (`lib/attestation-verify`);
 *   2. the build that ran is a version of the task's project on the contract;
 *   3. what the run was asked hashes to the attestation's `input_hash`, when
 *      the API keeps it (a run on chain is asked in its transaction, which
 *      the attestation window reads);
 *   4. what the run answered hashes to the attestation's `output_hash`;
 *   5. that answer names this task and the hash of what this page opened.
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
  /** What the run was asked, as the exact bytes; `null` for a run on chain, whose input is in its transaction. */
  input: string | null;
  output: string | null;
};

/** What the proof reads of an attestation. */
export type Attested = {
  task_id: number;
  input_hash?: string;
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

export type StepName = 'attestation' | 'enclave' | 'run' | 'build' | 'input' | 'answer' | 'task';

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
  /** What the run was asked, when the API keeps it. */
  input: string | null;
  /** The run's answer, when it was read. */
  output: string | null;
};

/**
 * `preparer`: the agent whose run made the task, and whose run carries it
 * out. `build`: the build the envelope names, `null` while the task is not
 * readable in this browser.
 */
export type Task = {
  id: string;
  project_id: string;
  preparer: string;
  build: string | null;
};

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

/** What a step says while the task is not readable in this browser. */
export const ONCE_READABLE = 'Checked once the task is readable in this browser.';

/**
 * Run the proof. Never throws: what could not be asked is a step not checked.
 *
 * `hash` is the hash of what this page opened, or `null` while the task is not
 * readable in this browser: the run, its enclave, its build and its answer are
 * held all the same, and the step that needs what was opened waits.
 */
export async function prove<A extends Attested>(task: Task, hash: string | null, deps: Deps<A>): Promise<Proof<A>> {
  const steps: Step[] = [];
  /** The last step is the task's; a proof that stopped short of it is not whole. */
  const whole = () => steps.at(-1)?.name === 'task';
  const done = (attestation: A | null, input: string | null, output: string | null): Proof<A> => ({
    holds: whole() && steps.every((s) => s.ok === true),
    unchecked: !steps.some((s) => s.ok === false) && (steps.some((s) => s.ok === null) || !whole()),
    steps,
    attestation,
    input,
    output,
  });

  let origin: Origin;
  let attestation: A | null;
  try {
    origin = await deps.origin();
    attestation = await deps.attestation(origin);
  } catch (e) {
    steps.push({ name: 'attestation', ok: null, said: `The run's attestation could not be read: ${message(e)}` });
    return done(null, null, null);
  }
  const input = typeof origin.input === 'string' ? origin.input : null;
  if (!attestation) {
    steps.push({ name: 'attestation', ok: false, said: `The run ${origin.run} that made this task has no attestation.` });
    return done(null, input, origin.output);
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

  // The run is made by the task's preparer: a task of a conversation, its
  // first or a turn, is made by the agent's run and by no other. What ties
  // the run to this task is its answer naming the task, the last step.
  const sameId = origin.door === 'https' ? attestation.call_id === origin.call_id : attestation.request_id === origin.request_id;
  const madeBy = (origin.door === 'https' ? attestation.payment_key_owner : attestation.caller_account_id) ?? task.preparer;
  if (attestation.project_id !== task.project_id) {
    steps.push({ name: 'run', ok: false, said: `The attested run was of ${attestation.project_id ?? 'no project'}, not of ${task.project_id}.` });
  } else if (!sameId || madeBy !== task.preparer) {
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

  // A run on chain carries no input here: it is in the transaction, which the
  // attestation window reads. Only an input the API keeps is held.
  if (input !== null) {
    if (!attestation.input_hash) {
      steps.push({ name: 'input', ok: false, said: 'The attestation does not name the hash of what the run was asked.' });
    } else {
      const asked = (await deps.sha256(input)) === attestation.input_hash;
      steps.push({
        name: 'input',
        ok: asked,
        said: asked ? "The run's input hashes to the attested input_hash." : "The run's input does not hash to the attested input_hash.",
      });
    }
  }

  let output = origin.output;
  if (output === null && origin.door === 'chain') {
    try {
      output = await deps.chainOutput(attestation);
    } catch (e) {
      steps.push({ name: 'answer', ok: null, said: `The run's transaction could not be read: ${message(e)}` });
      return done(attestation, input, null);
    }
  }
  if (output === null) {
    steps.push({ name: 'answer', ok: false, said: 'What the run answered is not kept, so it cannot be held to the attestation.' });
    return done(attestation, input, null);
  }
  const answered = (await deps.sha256(output)) === attestation.output_hash;
  steps.push({
    name: 'answer',
    ok: answered,
    said: answered ? "What the run answered is what the enclave signed for." : "What the run answered does not hash to the attestation's output hash.",
  });

  if (hash === null) {
    steps.push({ name: 'task', ok: null, said: ONCE_READABLE });
    return done(attestation, input, output);
  }
  const named = namesTask(output, task.id, hash);
  steps.push({
    name: 'task',
    ok: named,
    said: named
      ? 'That answer names this task, with the hash of exactly what is shown here.'
      : 'That answer does not name this task with the hash of what is shown here.',
  });
  return done(attestation, input, output);
}

/** The proof in one line. */
export function verdict(proof: Proof): string {
  if (proof.holds) return 'Made by a published build of the project, in an approved enclave.';
  const failed = proof.steps.find((s) => s.ok === false);
  if (failed) return `The proof does not hold. ${failed.said}`;
  const unread = proof.steps.find((s) => s.ok === null);
  // Every step but the last holds, and the last waits for the task to be readable here.
  if (unread?.said === ONCE_READABLE && proof.steps.at(-1) === unread && proof.steps.filter((s) => s.ok === true).length === proof.steps.length - 1) {
    return 'Made by a published build of the project, in an approved enclave. Whether it is this task is checked once the task is readable in this browser.';
  }
  return `The proof could not be checked. ${unread?.said ?? ''}`.trim();
}

/**
 * The run that carried an approved task out, held to the task: the platform
 * started it for the agent that prepared the task, so its attestation is of
 * the call the task names (`run`), names the preparer as the payment key's
 * owner, the task's project, and the build the task names. What the run
 * answered is the agent's and is not served to the owner, so it is not
 * checked here, and the step says so: the task's state is the coordinator's
 * word on it.
 */
export function carriedBy(task: Task, run: string, attestation: Attested): Step {
  if (attestation.call_id !== run) {
    return { name: 'run', ok: false, said: `The attestation is of the call ${attestation.call_id ?? 'none'}, not of the run ${run} the task names.` };
  }
  if (attestation.project_id !== task.project_id) {
    return { name: 'run', ok: false, said: `The attested run was of ${attestation.project_id ?? 'no project'}, not of ${task.project_id}.` };
  }
  if (attestation.payment_key_owner !== task.preparer) {
    return { name: 'run', ok: false, said: `The attested run was not a call of ${task.preparer}, whose run carries a task out.` };
  }
  if (task.build !== null && (attestation.executed_wasm_sha256 ?? '').toLowerCase() !== task.build.toLowerCase()) {
    return { name: 'build', ok: false, said: 'The attested run was not of the build the task names.' };
  }
  return {
    name: 'run',
    ok: true,
    said: `The run ${run} was a call of ${task.preparer} in ${task.project_id}${task.build === null ? '' : ', of the build the task names'}; what it answered is the agent's, not checked here.`,
  };
}
