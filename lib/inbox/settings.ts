/**
 * What the inbox's settings screen decides before it asks the API: whom a
 * mute names, and whether a URL can be a webhook's at all. The API is the
 * judge of both; these only keep a request that cannot succeed from being
 * sent, and say why in the owner's words.
 */

import type { Mute } from './api';

const ACCOUNT = /^(?=.{2,64}$)[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)*$/;
const PROJECT_UUID = /^p[0-9a-f]{16}$/;

export type Named = { ok: true; mute: Mute } | { ok: false; why: string };

/**
 * An agent is named by its account, a project by its uuid (`p` and sixteen
 * hex digits, as a task shows it). What is neither names nobody.
 */
export function muteOf(typed: string): Named {
  const subject = typed.trim();
  if (!subject) return { ok: false, why: 'Name an agent by its account, or a project by its uuid.' };
  if (PROJECT_UUID.test(subject)) return { ok: true, mute: { subject_is: 'project', subject } };
  if (ACCOUNT.test(subject)) return { ok: true, mute: { subject_is: 'agent', subject } };
  return { ok: false, why: `"${subject}" is neither an account id nor a project's uuid.` };
}

export type Url = { ok: true; url: string } | { ok: false; why: string };

/** An HTTPS URL with a host, no credentials in it, within the API's bound. */
export function webhookUrlOf(typed: string): Url {
  const url = typed.trim();
  if (!url) return { ok: false, why: 'Name the URL.' };
  if (url.length > 2048) return { ok: false, why: 'The URL is too long.' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, why: 'This is not a URL.' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, why: 'The URL must start with https://.' };
  if (parsed.username || parsed.password) return { ok: false, why: 'The URL must not carry a user name or a password.' };
  return { ok: true, url };
}

/** A day and a minute, in the reader's own time zone. */
export function when(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
