import type { Choice, PolicySchema, PolicyValue } from './types';

/**
 * The Mercury connector's policy — the owner's rule for what an agent may do
 * with their business bank account. Mirrors
 * `connectors/mercury-connector/src/policy.rs`: the keys, what absence means,
 * and the connector's fail-closed rules.
 *
 * It FAILS CLOSED, twice over. An empty policy is read-only: the agent can look
 * at accounts, payees, the ledger and invoices, and cannot move a cent. Payments
 * open only when BOTH amounts are set; adding a payee and issuing invoices are
 * switches that are off until turned on; a wire is a rail that must be ticked
 * by name. So every grant here says what is withheld, and the empty policy is
 * described as "read-only", never as "no limits".
 *
 * Amounts are whole dollars: the connector compares in cents and accepts
 * fractions, but a spending cap is not a place for them.
 *
 * `count_all_outgoing` is deliberately not a field. Its default (`true`, every
 * outgoing transaction on the account counts toward the budget) is the safe
 * reading, and the other value is chosen by hand only after an owner has
 * checked something on their own account — a checkbox would invite it.
 */

const READ = 'Read';
const MONEY = 'Money out';
const INVOICING = 'Invoicing';

/** Every operation the connector sells but `status`, which no policy governs. In the manifest's order. */
export const MERCURY_OPERATIONS: Choice[] = [
  { value: 'accounts', label: 'accounts and balances', group: READ },
  { value: 'recipients', label: 'saved payees', group: READ },
  { value: 'transactions', label: 'the ledger', group: READ },
  { value: 'payment_status', label: 'one payment’s status', group: READ },
  { value: 'create_invoice', label: 'render an invoice document (sends nothing)', group: READ },
  { value: 'customers', label: 'invoicing customers', group: READ },
  { value: 'invoices', label: 'list invoices', group: READ },
  { value: 'invoice_status', label: 'one invoice’s status', group: READ },
  { value: 'add_recipient', label: 'save a new payee (needs the switch)', group: MONEY },
  { value: 'pay_invoice', label: 'pay a payee (needs both amounts)', group: MONEY },
  { value: 'send_invoice', label: 'issue a real invoice (needs the switch)', group: INVOICING },
  { value: 'cancel_invoice', label: 'cancel an unpaid invoice (needs the switch)', group: INVOICING },
];

/** The rails the connector will ever pass to Mercury. A policy narrows the list; ACH is the default. */
export const MERCURY_METHODS: Choice[] = [
  { value: 'ach', label: 'ACH', group: 'Rails' },
  { value: 'check', label: 'Check', group: 'Rails' },
  { value: 'domesticWire', label: 'Domestic wire', group: 'Rails' },
  { value: 'internationalWire', label: 'International wire', group: 'Rails' },
];

const reads = MERCURY_OPERATIONS.filter((o) => o.group === READ).map((o) => o.value);

/** A Mercury recipient id as `recipients` lists it: one token, no spaces. */
export function recipientIdProblem(entry: string): string | null {
  const id = entry.trim();
  if (!id || /\s/.test(id) || id.length > 128) return `"${entry}" is not a recipient id — copy it from the connector’s recipients list`;
  return null;
}

function list(v: PolicyValue[string]): string[] {
  return Array.isArray(v) ? v : [];
}

function num(v: PolicyValue[string]): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function usd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

export const mercuryPolicy: PolicySchema = {
  connector: 'mercury',
  envKey: 'MERCURY_POLICY',
  emptySummary: 'read-only — the agent can look at accounts, payees, the ledger and invoices, and cannot pay, add a payee or send an invoice',
  groups: [
    {
      question: 'How much may it pay?',
      fields: [
        {
          key: 'max_payment_usd',
          label: 'Most per payment',
          kind: 'number',
          unit: 'USD, whole dollars',
          help: 'The largest single payment. Payments are off until BOTH this and the 30-day budget are set — one without the other allows nothing.',
          absentMeans: 'Empty: no payments at all.',
          min: 1,
        },
        {
          key: 'max_spend_usd_month',
          label: 'Budget per 30 days',
          kind: 'number',
          unit: 'USD, rolling 30 days',
          help: 'Everything paid or queued for approval in the last 30 days, counted from Mercury’s own ledger — every outgoing transaction on the account, yours included, so a busy month leaves the agent less. A payment that would cross it is refused.',
          absentMeans: 'Empty: no payments at all.',
          min: 1,
        },
      ],
    },
    {
      question: 'To whom?',
      fields: [
        {
          key: 'allowed_recipients',
          label: 'Only these payees',
          kind: 'list',
          help: 'Mercury recipient ids, as the connector’s recipients operation lists them. With a list here the agent can never add a payee, whatever the switch below says.',
          absentMeans: 'Empty: any payee already saved in Mercury.',
          placeholder: 'recipient id',
          normalize: (e) => e.trim(),
          validateEntry: recipientIdProblem,
        },
        {
          key: 'allow_new_recipients',
          label: 'Add new payees',
          kind: 'toggle',
          help: 'Lets the agent save a payee from account and routing numbers it was given, and pay it. Off, it pays only payees already saved in Mercury by you.',
          absentMeans: 'Off: only payees already saved in Mercury.',
        },
      ],
    },
    {
      question: 'How?',
      fields: [
        {
          key: 'payment_methods',
          label: 'Rails',
          kind: 'choices',
          help: 'The connector uses only what is ticked. A wire is expensive and cannot be recalled, so it is never on unless you tick it.',
          absentMeans: 'Nothing ticked: ACH only.',
          options: MERCURY_METHODS,
          presets: [{ label: 'ACH only', values: ['ach'] }],
        },
        {
          key: 'account_id',
          label: 'Account',
          kind: 'text',
          help: 'The Mercury account id everything runs against. With several accounts on the login, payments are refused until one is named here: the agent is not allowed to choose which account it draws from.',
          absentMeans: 'Empty: the login’s only account. With more than one account, reads still work and no payment runs.',
          placeholder: 'account id from Mercury',
        },
      ],
    },
    {
      question: 'Off unless you say so',
      fields: [
        {
          key: 'allow_invoicing',
          label: 'Issue and cancel invoices',
          kind: 'toggle',
          help: 'send_invoice creates a real Mercury invoice and Mercury emails it to the customer under your company’s name; cancel_invoice cannot be undone. Rendering an invoice document needs no switch.',
          absentMeans: 'Off: the agent can read invoices and render a document, and cannot send or cancel one.',
        },
      ],
    },
    {
      question: 'Which operations at all?',
      fields: [
        {
          key: 'allowed_operations',
          label: 'Operations',
          kind: 'choices',
          help: 'When anything is ticked, the agent may run only that — reads included — and status always answers. An operation added to the connector later is NOT included until you tick it.',
          absentMeans: 'Nothing ticked: every operation, subject to the rules above.',
          options: MERCURY_OPERATIONS,
          presets: [
            { label: 'Read only', values: reads },
            { label: 'Read, and pay saved payees', values: [...reads, 'pay_invoice'] },
          ],
        },
      ],
    },
  ],

  check(value: PolicyValue): string[] {
    const problems: string[] = [];
    const perPayment = num(value.max_payment_usd);
    const perMonth = num(value.max_spend_usd_month);
    const ops = list(value.allowed_operations);
    if ((perPayment === undefined) !== (perMonth === undefined)) {
      problems.push('Set both "Most per payment" and "Budget per 30 days" — with one of them missing no payment runs');
    }
    if (perPayment !== undefined && perMonth !== undefined && perPayment > perMonth) {
      problems.push('"Most per payment" is larger than the 30-day budget, so no payment of that size could ever run');
    }
    if (value.allow_new_recipients === true && list(value.allowed_recipients).length > 0) {
      problems.push('"Add new payees" is on, but payees are pinned to a list — the connector refuses to add one. Clear the list or turn the switch off');
    }
    if (ops.includes('pay_invoice') && (perPayment === undefined || perMonth === undefined)) {
      problems.push('pay_invoice is ticked but there is no budget — set both amounts, or untick it');
    }
    if (ops.includes('add_recipient') && value.allow_new_recipients !== true) {
      problems.push('add_recipient is ticked but "Add new payees" is off — turn it on, or untick add_recipient');
    }
    if (ops.some((o) => o === 'send_invoice' || o === 'cancel_invoice') && value.allow_invoicing !== true) {
      problems.push('Invoicing operations are ticked but "Issue and cancel invoices" is off — turn it on, or untick them');
    }
    return problems;
  },

  summarize(value: PolicyValue): string {
    const perPayment = num(value.max_payment_usd);
    const perMonth = num(value.max_spend_usd_month);
    const pinned = list(value.allowed_recipients);
    const methods = list(value.payment_methods);
    const rails = methods.length === 0 ? 'ACH' : joinAnd(methods.map((m) => MERCURY_METHODS.find((o) => o.value === m)?.label ?? m));
    const account = typeof value.account_id === 'string' && value.account_id.trim() ? ` from account ${value.account_id.trim()}` : '';

    const parts: string[] = [];
    if (perPayment !== undefined && perMonth !== undefined) {
      const payees =
        pinned.length > 0
          ? `${pinned.length} pinned payee${pinned.length === 1 ? '' : 's'}`
          : value.allow_new_recipients === true
            ? 'any saved payee and payees it adds'
            : 'payees already saved in Mercury';
      parts.push(`The agent may pay up to ${usd(perPayment)} per payment and ${usd(perMonth)} per 30 days by ${rails}${account}, to ${payees}`);
    } else {
      parts.push('The agent cannot pay');
    }
    parts.push(value.allow_invoicing === true ? 'it may issue and cancel invoices' : 'it cannot issue or cancel invoices');
    const ops = list(value.allowed_operations);
    if (ops.length > 0) parts.push(`only ${ops.length} operation${ops.length === 1 ? '' : 's'} ${ops.length === 1 ? 'is' : 'are'} allowed at all`);
    return `${parts.join('; ')}.`;
  },
};

/**
 * Where a first connection starts: nothing spent, the account pinned when the
 * token reaches exactly one — so the owner sees what they are about to allow
 * before they allow anything. A starting point the owner edits, never a default
 * applied behind them.
 */
export function mercuryStartingPolicy(accountId: string | null): PolicyValue {
  return accountId ? { account_id: accountId } : {};
}
