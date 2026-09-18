import type { PolicySchema, PolicyValue } from './types';

/**
 * The Gmail connector's policy — the owner's rule for mail an agent sends from
 * their address. Mirrors `connectors/gmail-connector/src/policy.rs`: the keys,
 * what absence means, and the shape of an address it accepts.
 */

const LOCAL_EXTRA = "!#$%&'*+/=?^_`{|}~.-";

/** A bare address — `local@domain` and nothing richer — the same rule the connector applies. */
export function bareAddressProblem(entry: string): string | null {
  const address = entry.trim();
  const at = address.indexOf('@');
  if (at < 0 || address.indexOf('@', at + 1) >= 0) return `"${entry}" is not a bare email address (name@example.com)`;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  const localOk =
    local.length > 0 &&
    local.length <= 64 &&
    !local.startsWith('.') &&
    !local.endsWith('.') &&
    !local.includes('..') &&
    [...local].every((c) => /[A-Za-z0-9]/.test(c) || LOCAL_EXTRA.includes(c));
  if (!localOk || domainProblem(domain)) {
    return `"${entry}" is not a bare email address — no display name, no angle brackets, one address per entry`;
  }
  return null;
}

/** A domain the connector would compare against: labels of letters, digits and hyphens, at least one dot. */
export function domainProblem(entry: string): string | null {
  const domain = entry.trim();
  if (domain.toLowerCase() === 'any') return null;
  const ok =
    domain.length > 0 &&
    domain.length <= 253 &&
    domain.includes('.') &&
    domain
      .split('.')
      .every((label) => label.length > 0 && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-') && /^[A-Za-z0-9-]+$/.test(label));
  return ok ? null : `"${entry}" is not a domain (example.com)`;
}

function list(value: PolicyValue, key: string): string[] {
  const v = value[key];
  return Array.isArray(v) ? v : [];
}

function num(value: PolicyValue, key: string): number | undefined {
  const v = value[key];
  return typeof v === 'number' ? v : undefined;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const gmailPolicy: PolicySchema = {
  connector: 'gmail',
  envKey: 'GMAIL_POLICY',
  groups: [
    {
      question: 'Who can it write to?',
      fields: [
        {
          key: 'recipient_domains',
          label: 'Only these domains',
          kind: 'list',
          help: 'Mail may go to any address at these domains. "any" means anywhere. Combined with the addresses below: a recipient passes if either list allows it.',
          absentMeans: 'Empty, with no addresses below: anyone.',
          placeholder: 'example.com',
          normalize: (e) => e.trim().toLowerCase(),
          validateEntry: domainProblem,
        },
        {
          key: 'recipients',
          label: 'Only these addresses',
          kind: 'list',
          help: 'Exact addresses the agent may write to, whatever their domain. One disallowed address refuses the whole message.',
          absentMeans: 'Empty, with no domains above: anyone.',
          placeholder: 'boss@example.com',
          normalize: (e) => e.trim().toLowerCase(),
          validateEntry: bareAddressProblem,
        },
      ],
    },
    {
      question: 'How much?',
      fields: [
        {
          key: 'max_per_day',
          label: 'Messages a day',
          kind: 'number',
          help: 'Counted per calling agent, in UTC days, and only for mail that actually left — a refused message gives its place back. The platform separately caps every wallet at 400 a day.',
          absentMeans: 'Empty: as many as it likes.',
          unit: 'a day',
          min: 1,
        },
        {
          key: 'max_recipients',
          label: 'Recipients per message',
          kind: 'number',
          help: 'To and Cc together.',
          absentMeans: 'Empty: any number.',
          unit: 'per message',
          min: 1,
        },
      ],
    },
    {
      question: 'What else?',
      fields: [
        {
          key: 'max_attachment_kb',
          label: 'Attachments up to',
          kind: 'number',
          help: 'The total size of one message’s files. This is the one rule that works the other way round: with nothing here, attachments are refused.',
          absentMeans: 'Empty: no attachments at all.',
          unit: 'KB',
          min: 1,
        },
        {
          key: 'subject_prefix',
          label: 'Subject prefix',
          kind: 'text',
          help: 'Put in front of every subject that does not already start with it, so a recipient can tell agent mail from yours.',
          absentMeans: 'Empty: subjects go as written.',
          placeholder: '[agent]',
        },
      ],
    },
  ],
  summarize(value) {
    const domains = list(value, 'recipient_domains').filter((d) => d.toLowerCase() !== 'any');
    const anywhere = list(value, 'recipient_domains').some((d) => d.toLowerCase() === 'any');
    const addresses = list(value, 'recipients');
    let who: string;
    if (anywhere || (domains.length === 0 && addresses.length === 0)) {
      who = 'anyone';
    } else {
      const parts: string[] = [];
      if (domains.length) parts.push(`anyone at ${domains.join(', ')}`);
      if (addresses.length) parts.push(addresses.join(', '));
      who = `only ${parts.join(' and ')}`;
    }
    const perDay = num(value, 'max_per_day');
    const perMessage = num(value, 'max_recipients');
    const kb = num(value, 'max_attachment_kb');
    const prefix = typeof value.subject_prefix === 'string' ? value.subject_prefix.trim() : '';
    const clauses = [
      `The agent may write to ${who}`,
      perDay === undefined ? 'any number of messages a day' : `up to ${plural(perDay, 'message', 'messages')} a day`,
      perMessage === undefined ? 'any number of recipients per message' : `${plural(perMessage, 'recipient', 'recipients')} per message`,
      kb === undefined ? 'no attachments' : `attachments up to ${kb} KB`,
    ];
    return `${clauses.join(', ')}${prefix ? `; subjects get “${prefix}”` : ''}.`;
  },
};
