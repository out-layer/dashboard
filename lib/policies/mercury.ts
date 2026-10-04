import type { Choice, PolicyRule, PolicySchema, PolicyValue, RuleSpec } from './types';

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

/**
 * What a rule may name — the connector's `rules.rs`: the four writes, and the
 * conditions each carries. An amount for a payment or an invoice (its lines
 * before tax), a rail and a payee for a payment.
 */
export const MERCURY_RULES: RuleSpec = {
  ops: [
    { value: 'pay_invoice', label: 'Paying' },
    { value: 'add_recipient', label: 'Saving a new payee' },
    { value: 'send_invoice', label: 'Issuing an invoice' },
    { value: 'cancel_invoice', label: 'Cancelling an invoice' },
  ],
  conditions: [
    { key: 'min_usd', label: 'from $', kind: 'usd', ops: ['pay_invoice', 'send_invoice'] },
    { key: 'max_usd', label: 'up to $', kind: 'usd', ops: ['pay_invoice', 'send_invoice'] },
    { key: 'methods', label: 'by', kind: 'set', options: MERCURY_METHODS.map((m) => ({ value: m.value, label: m.label })), ops: ['pay_invoice'] },
    {
      key: 'payee',
      label: 'to',
      kind: 'one',
      options: [
        { value: 'saved', label: 'a payee saved in Mercury' },
        { value: 'new', label: 'a new payee' },
      ],
      ops: ['pay_invoice'],
    },
  ],
  max: 50,
};

const RULE_WORDS: Record<string, string> = {
  pay_invoice: 'payments',
  add_recipient: 'new payees',
  send_invoice: 'invoices',
  cancel_invoice: 'invoice cancellations',
};

/** A rule in the owner's words: "payments by Domestic wire from $500 wait for you". */
export function ruleWords(rule: PolicyRule): string {
  const w = rule.when;
  let out = RULE_WORDS[w.op] ?? w.op;
  if (Array.isArray(w.methods) && w.methods.length > 0) {
    out += ` by ${joinAnd(w.methods.map((m) => MERCURY_METHODS.find((o) => o.value === m)?.label ?? m)).replace(/ and /, ' or ')}`;
  }
  const min = typeof w.min_usd === 'number' ? w.min_usd : undefined;
  const max = typeof w.max_usd === 'number' ? w.max_usd : undefined;
  if (min !== undefined && max !== undefined) out += ` from ${usd(min)} to ${usd(max)}`;
  else if (min !== undefined) out += ` from ${usd(min)}`;
  else if (max !== undefined) out += ` up to ${usd(max)}`;
  if (w.payee === 'saved') out += ' to saved payees';
  if (w.payee === 'new') out += ' to new payees';
  const verb = rule.then === 'ask' ? 'wait for you' : rule.then === 'refuse' ? 'are refused' : 'run by themselves';
  return `${out} ${verb}`;
}

/** A Mercury recipient id as `recipients` lists it: one token, no spaces. */
export function recipientIdProblem(entry: string): string | null {
  const id = entry.trim();
  if (!id || /\s/.test(id) || id.length > 128) return `"${entry}" is not a recipient id — copy it from the connector’s recipients list`;
  return null;
}

function list(v: PolicyValue[string]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
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
  needs: { pay_invoice: ['max_payment_usd', 'max_spend_usd_month'] },
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
          help: 'What the agent paid in the last 30 days, counted from Mercury’s own ledger, plus payments waiting for approval. Only the agent’s own payments count, unless you tick "Count every payment from the account" below. A payment that would cross it is refused.',
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
          link: { key: 'allowed_operations', through: ['add_recipient', 'pay_invoice'], ticks: ['add_recipient'], onlyWith: ['add_recipient'] },
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
        },
        {
          key: 'account_id',
          label: 'Account number',
          kind: 'text',
          help: 'The account the agent may use — and the only one, when set: reads, payments and invoices all run against it. It is the account number shown in your Mercury dashboard, a number like 12345678901. Not sure which? Leave it empty and ask your agent which accounts it sees; it can tell you their names and last four digits.',
          absentMeans: 'Empty: with a single account on the login, that account. With several, the agent can read any of them and no payment runs.',
          placeholder: '12345678901',
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
          link: { key: 'allowed_operations', through: ['send_invoice', 'cancel_invoice'], ticks: ['send_invoice', 'cancel_invoice'], onlyWith: ['send_invoice', 'cancel_invoice'] },
        },
        {
          key: 'count_all_outgoing',
          label: 'Count every payment from the account',
          kind: 'toggle',
          help: 'Off, the 30-day budget counts only the payments the agent made. On, it counts every payment leaving the account, the ones you and your team make included, so a busy month leaves the agent less.',
          absentMeans: 'Off: only the agent’s own payments count toward the budget.',
        },
        {
          key: 'sandbox',
          label: 'Sandbox token',
          kind: 'toggle',
          help: 'Tick it when the token was created at sandbox.mercury.com — Mercury’s test bank, with its own login and simulated money. Calls then go to Mercury’s sandbox API. Nothing else changes: the limits above are checked the same way. A token and this switch that disagree are answered by Mercury with 401.',
          absentMeans: 'Off: the token is a production one, and payments move real money.',
        },
      ],
    },
    {
      question: 'What may it do?',
      note: 'Auto-approve: the agent runs it within the limits below. Manual approval: it is prepared, shown to you in your inbox, and made on your yes. Unticked: it does not run. Rules with conditions — from an amount, by a rail, to a new payee — go under the table. A group’s name turns the whole group on or off.',
      fields: [
        {
          key: 'allowed_operations',
          label: 'Operations',
          kind: 'choices',
          actions: true,
          help: 'When anything is ticked, the agent may run only that — reads included — and status always answers. An operation added to the connector later is NOT included until you tick it.',
          absentMeans: 'Nothing ticked: every operation, subject to the rules above.',
          options: MERCURY_OPERATIONS,
          emptyMeansAll: true,
        },
        {
          key: 'rules',
          label: 'Rules',
          kind: 'rules',
          asks: true,
          asksBefore: 'allowed_operations',
          ruleSpec: MERCURY_RULES,
          help: 'For a write the rest of the policy allows: run it, wait for your yes, or refuse it. Checked top to bottom — the first rule that matches decides; with none matching, the write runs. A rule never lets through what the limits refuse. A write that waits is prepared and shown to you whole in your inbox, and nothing happens at the bank until you approve it with one signature.',
          absentMeans: 'No rules: every allowed write runs without asking.',
        },
      ],
    },
  ],

  check(value: PolicyValue): string[] {
    const problems: string[] = [];
    // A rule about an operation the policy does not allow decides nothing.
    const allowedOps = list(value.allowed_operations);
    const rules = (Array.isArray(value.rules) ? value.rules : []).filter((r): r is PolicyRule => typeof r === 'object' && r !== null && 'when' in r);
    rules.forEach((r, i) => {
      if (allowedOps.length > 0 && !allowedOps.includes(r.when.op)) {
        problems.push(`Rule ${i + 1} does nothing: ${r.when.op} is not allowed above — tick it, or remove the rule`);
      }
    });
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
      problems.push('add_recipient is ticked but its switch (allow_new_recipients) is off — tick “save a new payee” in the table again to allow it, or untick it');
    }
    if (ops.some((o) => o === 'send_invoice' || o === 'cancel_invoice') && value.allow_invoicing !== true) {
      problems.push('Invoicing operations are ticked but their switch (allow_invoicing) is off — tick them in the table again to allow them, or untick them');
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

    // A switch or an amount does something only when the operation it governs is allowed too.
    const ops = list(value.allowed_operations);
    const runs = (op: string) => ops.length === 0 || ops.includes(op);
    const parts: string[] = [];
    if (perPayment !== undefined && perMonth !== undefined && runs('pay_invoice')) {
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
    const issue = value.allow_invoicing === true && runs('send_invoice');
    const cancel = value.allow_invoicing === true && runs('cancel_invoice');
    parts.push(
      issue && cancel
        ? 'it may issue and cancel invoices'
        : issue
          ? 'it may issue invoices and cannot cancel one'
          : cancel
            ? 'it may cancel invoices and cannot issue one'
            : 'it cannot issue or cancel invoices',
    );
    if (ops.length > 0) parts.push(`only ${ops.length} operation${ops.length === 1 ? '' : 's'} ${ops.length === 1 ? 'is' : 'are'} allowed at all`);
    if (value.count_all_outgoing === true && perPayment !== undefined && perMonth !== undefined) {
      parts.push('the 30-day budget counts every payment from the account');
    }
    // The owner's rules, in their order: what waits for them and what is refused.
    const rules = (Array.isArray(value.rules) ? value.rules : []).filter((r): r is PolicyRule => typeof r === 'object' && r !== null && 'when' in r);
    const said = rules.map(ruleWords).join('; ');
    const ruled = said ? ` ${said.charAt(0).toUpperCase()}${said.slice(1)}.` : '';
    const sentence = `${parts.join('; ')}.${ruled}`;
    return value.sandbox === true ? `Mercury sandbox — no real money moves. ${sentence}` : sentence;
  },
};
