/**
 * The inbox API of the coordinator, inside an owner's session.
 *
 * Every refusal is an `InboxRefused` carrying the API's `reason`: a caller
 * branches on it and never on the sentence. "Nothing waits" is an empty list;
 * a refusal is never read as one. A `reason` this build does not know is kept
 * as it came, and is not a success.
 */

export type TaskState = 'open' | 'answering' | 'done' | 'failed' | 'rejected' | 'cancelled' | 'expired' | 'void';

const TASK_STATES: readonly string[] = ['open', 'answering', 'done', 'failed', 'rejected', 'cancelled', 'expired', 'void'];

/** A task as the inbox lists it: who asked, and ciphertext. */
export type InboxTask = {
  id: string;
  project_id: string;
  project_uuid: string;
  preparer: string;
  profile: string;
  /** The vault the owner's row is bound to, whose master seals the task; `null` for the default master. */
  vault: string | null;
  kind: 'confirm' | 'input';
  /** A state this build does not know is `unknown`: never drawn as open. */
  state: TaskState | 'unknown';
  created_at: number;
  expires_at: number;
  run?: string;
  reply_pubkey: string;
  content: string | null;
  device_copy: string | null;
  locked: boolean;
};

export type OwnerSession = { token: string; device_id: string; account_id: string; valid_until: number };

export type SignIn = {
  account_id: string;
  device_pubkey: string;
  valid_until: number;
  public_key: string;
  signature: string;
  nonce: string;
};

export type Mute = { subject_is: 'agent' | 'project'; subject: string };

export class InboxRefused extends Error {
  status: number;
  reason: string;
  terminal: boolean;

  constructor(message: string, status: number, reason: string, terminal: boolean) {
    super(message);
    this.name = 'InboxRefused';
    this.status = status;
    this.reason = reason;
    this.terminal = terminal;
  }

  /** The session is gone: sign in again. */
  get sessionEnded(): boolean {
    return this.reason === 'session_required' || this.reason === 'session_replaced';
  }

  /** The session ended because the account signed in on one device more than it may have. */
  get sessionReplaced(): boolean {
    return this.reason === 'session_replaced';
  }
}

async function refusal(response: Response): Promise<InboxRefused> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown; reason?: unknown; terminal?: unknown };
    // The wallet's routes name their code in `error` and their sentence in `message`.
    const reason = typeof parsed.reason === 'string' ? parsed.reason : typeof parsed.error === 'string' && typeof parsed.message === 'string' ? parsed.error : 'unknown';
    // A body with a sentence and no code still says its sentence.
    const sentence =
      typeof parsed.reason === 'string' || typeof parsed.message !== 'string' ? parsed.error : parsed.message;
    return new InboxRefused(
      typeof sentence === 'string' && sentence ? sentence : `The request was refused (${response.status}).`,
      response.status,
      reason,
      parsed.terminal === true || (parsed.terminal === undefined && response.status !== 503 && response.status !== 401),
    );
  } catch {
    const transient = response.status === 429 || response.status === 503;
    return new InboxRefused(body.slice(0, 200) || `The request was refused (${response.status}).`, response.status, 'unknown', !transient);
  }
}

async function ask<T>(base: string, path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw await refusal(response);
  return read<T>(response);
}

/** An answer that cannot be read is no answer: said in the page's words, not the parser's. */
async function read<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new InboxRefused('The answer could not be read.', response.status, 'unknown', false);
  }
}

export function signIn(base: string, statement: SignIn): Promise<OwnerSession> {
  return ask(base, '/inbox/session', { method: 'POST', body: statement });
}

export function signOut(base: string, token: string): Promise<{ revoked: boolean }> {
  return ask(base, '/inbox/session', { method: 'DELETE', token });
}

/** The newest tasks; `more` says that older ones exist and are not listed. */
export type Listed = { tasks: InboxTask[]; more: boolean };

/** Read the inbox's answer; one without a list is a refusal, never an empty inbox. */
export function readListed(answer: unknown): Listed {
  const given = (answer ?? {}) as { tasks?: unknown; more?: unknown };
  if (!Array.isArray(given.tasks)) throw new InboxRefused('The inbox answered without a list.', 200, 'unknown', false);
  const rows = given.tasks as unknown[];
  if (rows.some((row) => typeof row !== 'object' || row === null || typeof (row as { id?: unknown }).id !== 'string')) {
    throw new InboxRefused('The inbox answered with a task that is none.', 200, 'unknown', false);
  }
  return {
    tasks: (given.tasks as InboxTask[]).map((task) => ({
      ...task,
      state: TASK_STATES.includes(task.state) ? task.state : 'unknown',
    })),
    more: given.more === true,
  };
}

export async function listTasks(base: string, token: string, show: 'waiting' | 'closed' = 'waiting'): Promise<Listed> {
  return readListed(await ask<unknown>(base, `/inbox/tasks?show=${show}`, { token }));
}

export function rejectTask(base: string, token: string, id: string, reason: string | null): Promise<{ id: string; state: TaskState }> {
  return ask(base, `/inbox/tasks/${encodeURIComponent(id)}/reject`, { method: 'POST', token, body: { reason } });
}

export function deleteTask(base: string, token: string, id: string): Promise<{ deleted: number }> {
  return ask(base, `/inbox/tasks/${encodeURIComponent(id)}`, { method: 'DELETE', token });
}

export function mute(base: string, token: string, who: Mute, deleteWaiting: boolean): Promise<{ deleted: number }> {
  return ask(base, '/inbox/mutes', { method: 'POST', token, body: { ...who, delete_waiting: deleteWaiting } });
}

export function unmute(base: string, token: string, who: Mute): Promise<{ mutes: Mute[] }> {
  return ask(base, '/inbox/mutes', { method: 'DELETE', token, body: who });
}

/** The owner's signature for one action, good for ten minutes, once. */
export type Confirmation = { at: number; public_key: string; signature: string; nonce: string };

/** Withdraw another device of the owner's, signed for: its session ends and nothing more is encrypted to it. */
export function withdrawDevice(base: string, token: string, id: string, confirmation: Confirmation): Promise<{ revoked: boolean }> {
  return ask(base, `/inbox/devices/${encodeURIComponent(id)}`, { method: 'DELETE', token, body: { confirmation } });
}

export function listMutes(base: string, token: string): Promise<{ mutes: Mute[] }> {
  return ask(base, '/inbox/mutes', { token });
}

/** Every task addressed to the owner, or only an agent's or a project's. */
export function deleteTasks(
  base: string,
  token: string,
  only: { preparer?: string; project_uuid?: string } = {},
): Promise<{ deleted: number }> {
  const query = new URLSearchParams();
  if (only.preparer) query.set('preparer', only.preparer);
  if (only.project_uuid) query.set('project_uuid', only.project_uuid);
  const narrowed = query.toString();
  return ask(base, `/inbox/tasks${narrowed ? `?${narrowed}` : ''}`, { method: 'DELETE', token });
}

/** A device signed in to the owner's inbox. Times are Unix seconds. */
export type InboxDevice = {
  id: string;
  device_pubkey: string;
  /** The wallet key that signed the device in. */
  signer_pubkey: string;
  created_at: number;
  valid_until: number;
  /** The device this session is on. */
  this: boolean;
};

export async function listDevices(base: string, token: string): Promise<InboxDevice[]> {
  const answer = await ask<{ devices?: unknown }>(base, '/inbox/devices', { token });
  if (!Array.isArray(answer.devices)) throw new InboxRefused('The devices were answered without a list.', 200, 'unknown', false);
  return answer.devices as InboxDevice[];
}

/**
 * Where the owner is told of a task. The URL stays in force when the session
 * that named it ends, so it says which session that was.
 */
export type InboxWebhook = {
  /** `null` when no URL is named. */
  url: string | null;
  /** Unix seconds. */
  set_at: number | null;
  /** The wallet key that signed in the session that named the URL. */
  set_by_key: string | null;
  /** Named in the session that asks. */
  set_here: boolean;
  /**
   * The secret the events are signed with: told once, in the answer to the
   * naming of the URL, and never again.
   */
  secret?: string;
};

/** Read an answer about the webhook; one that is not whole is a refusal. */
export function readWebhook(answer: unknown): InboxWebhook {
  const given = (answer ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => value === null || typeof value === 'string';
  const whole =
    text(given.url) &&
    given.url !== undefined &&
    (given.set_at === null || typeof given.set_at === 'number') &&
    text(given.set_by_key) &&
    typeof given.set_here === 'boolean' &&
    (given.secret === undefined || typeof given.secret === 'string');
  if (!whole) throw new InboxRefused('The webhook was answered without its URL.', 200, 'unknown', false);
  return given as InboxWebhook;
}

export async function webhook(base: string, token: string): Promise<InboxWebhook> {
  return readWebhook(await ask<unknown>(base, '/inbox/webhook', { token }));
}

export async function setWebhook(base: string, token: string, url: string, confirmation: Confirmation): Promise<InboxWebhook> {
  return readWebhook(await ask<unknown>(base, '/inbox/webhook', { method: 'PUT', token, body: { url, confirmation } }));
}

export async function deleteWebhook(base: string, token: string, confirmation: Confirmation): Promise<InboxWebhook> {
  return readWebhook(await ask<unknown>(base, '/inbox/webhook', { method: 'DELETE', token, body: { confirmation } }));
}

/** One file of a task that waits, as ciphertext in base64. */
export async function taskFile(base: string, token: string, id: string, at: number): Promise<string> {
  const answer = await ask<{ ciphertext?: unknown }>(base, `/inbox/tasks/${encodeURIComponent(id)}/files/${at}`, { token });
  if (typeof answer.ciphertext !== 'string') throw new InboxRefused('The file was answered without its bytes.', 200, 'unknown', false);
  return answer.ciphertext;
}

/**
 * The run that made a task of the owner's: what it was asked (`input`, the
 * bytes whose SHA-256 is the attestation's `input_hash`; `null` for a run on
 * chain, asked in its transaction) and what it answered.
 */
export function taskOrigin(
  base: string,
  token: string,
  id: string,
): Promise<{ run: string; door: 'https' | 'chain'; call_id?: string; request_id?: number; input: string | null; output: string | null }> {
  return ask(base, `/inbox/tasks/${encodeURIComponent(id)}/origin`, { token });
}

/** A run's attestation, which is public; `null` when the run has none. */
export async function attestationOf<T>(
  base: string,
  made: { door: 'https' | 'chain'; call_id?: string; request_id?: number },
): Promise<T | null> {
  const path =
    made.door === 'https'
      ? `by-call/${encodeURIComponent(String(made.call_id))}`
      : `by-request/${encodeURIComponent(String(made.request_id))}`;
  const response = await fetch(`${base}/attestations/${path}`);
  if (response.status === 404) return null;
  if (!response.ok) throw await refusal(response);
  return read<T>(response);
}

/** What waits for approval on one wallet the session's account owns. */
export async function pendingApprovals(base: string, token: string, walletPubkey: string): Promise<Record<string, unknown>[]> {
  const answer = await ask<{ pending_approvals?: unknown }>(
    base,
    `/wallet/v1/pending_approvals_by_pubkey?near_pubkey=${encodeURIComponent(walletPubkey)}`,
    { token },
  );
  if (!Array.isArray(answer.pending_approvals)) {
    throw new InboxRefused('The approvals were answered without a list.', 200, 'unknown', false);
  }
  return answer.pending_approvals as Record<string, unknown>[];
}

