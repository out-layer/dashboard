import type { PolicySchema, PolicyValue } from './types';

/**
 * The Polymarket connector's policy — the owner's caps on what an agent may
 * take a position on, from its own wallet. Mirrors
 * `connectors/polymarket-connector/src/policy.rs`: the keys, what absence
 * means, and the fail-closed rules.
 *
 * It FAILS CLOSED. No policy, or a policy that names no size, is read-only:
 * markets, orders and positions answer, and `cancel` stays open so an agent
 * whose policy was withdrawn can still take its orders off the book. An order
 * needs BOTH `max_order_usd` and `max_daily_volume_usd`. Money moves only
 * where the two switches allow, and a withdrawal goes only to `intents` unless
 * `withdraw_to` names somewhere else. Every grant here says what is withheld.
 *
 * Amounts are whole dollars.
 */

function num(v: PolicyValue[string]): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function list(v: PolicyValue[string]): string[] {
  return Array.isArray(v) ? v : [];
}

function usd(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

/** A condition id (0x + 64 hex), a token id (digits), or "any". */
export function marketProblem(entry: string): string | null {
  const m = entry.trim();
  if (m.toLowerCase() === 'any') return null;
  if (/^0x[0-9a-fA-F]{64}$/.test(m) || /^[0-9]{10,80}$/.test(m)) return null;
  return `"${entry}" is neither a condition id (0x…, 64 hex characters) nor a token id (digits)`;
}

/** `intents`, `confidential`, or a NEAR account. */
export function withdrawToProblem(entry: string): string | null {
  const to = entry.trim();
  if (to === 'intents' || to === 'confidential') return null;
  const account = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
  if (to.length >= 2 && to.length <= 64 && account.test(to)) return null;
  return 'Write intents, confidential, or a NEAR account';
}

export const polymarketPolicy: PolicySchema = {
  connector: 'polymarket',
  envKey: 'POLYMARKET_POLICY',
  emptySummary: 'read-only — the agent can read markets, orders and positions and cancel its orders, and cannot buy, sell, deposit, withdraw or claim',
  groups: [
    {
      question: 'How much may it trade?',
      fields: [
        {
          key: 'max_order_usd',
          label: 'Most per order',
          kind: 'number',
          unit: 'USD, whole dollars',
          help: 'Price × shares of one order. Orders are off until both this and the daily volume are set.',
          absentMeans: 'Empty: no orders at all.',
          min: 1,
        },
        {
          key: 'max_daily_volume_usd',
          label: 'Volume per day',
          kind: 'number',
          unit: 'USD, UTC days',
          help: 'Everything the agent ordered in a UTC day, counted whether or not it filled.',
          absentMeans: 'Empty: no orders at all.',
          min: 1,
        },
        {
          key: 'max_open_notional_usd',
          label: 'At risk at once',
          kind: 'number',
          unit: 'USD',
          help: 'Open orders plus positions together, read from the venue before each order rather than from a counter.',
          absentMeans: 'Empty: no cap on what is open at once (the two above still apply).',
          min: 1,
        },
      ],
    },
    {
      question: 'Which markets?',
      fields: [
        {
          key: 'markets',
          label: 'Only these markets',
          kind: 'list',
          help: 'Condition ids or token ids, as the connector’s markets operation lists them. "any" means every market.',
          absentMeans: 'Empty: every market.',
          placeholder: '0x… or a token id',
          normalize: (e) => e.trim(),
          validateEntry: marketProblem,
        },
      ],
    },
    {
      question: 'May money move in and out?',
      fields: [
        {
          key: 'allow_deposit',
          label: 'Fund the venue from the wallet',
          kind: 'toggle',
          help: 'Lets the agent move USDC from the wallet’s intents balance to its Polymarket deposit wallet. The cap below bounds one deposit.',
          absentMeans: 'Off: nothing moves to the venue.',
        },
        {
          key: 'max_deposit_usd',
          label: 'Most per deposit',
          kind: 'number',
          unit: 'USD, whole dollars',
          help: 'The most one deposit may carry.',
          absentMeans: 'Empty: no cap on one deposit (the switch above still decides whether any happens).',
          min: 1,
        },
        {
          key: 'allow_withdraw',
          label: 'Withdraw back',
          kind: 'toggle',
          help: 'Lets the agent move USDC from Polymarket back out.',
          absentMeans: 'Off: nothing leaves the venue.',
        },
        {
          key: 'withdraw_to',
          label: 'Withdraw only to',
          kind: 'text',
          help: 'intents (the wallet’s own balance), confidential, or one NEAR account.',
          absentMeans: 'Empty: withdrawals may go to intents and nowhere else.',
          placeholder: 'intents',
        },
      ],
    },
  ],

  check(value: PolicyValue): string[] {
    const problems: string[] = [];
    const order = num(value.max_order_usd);
    const volume = num(value.max_daily_volume_usd);
    if ((order === undefined) !== (volume === undefined)) {
      problems.push('Set both "Most per order" and "Volume per day" — with one of them missing nothing is placed');
    }
    if (order !== undefined && volume !== undefined && order > volume) {
      problems.push('"Most per order" is larger than the day’s volume, so no order of that size could ever run');
    }
    if (typeof value.withdraw_to === 'string' && value.withdraw_to.trim()) {
      const why = withdrawToProblem(value.withdraw_to);
      if (why) problems.push(`Withdraw only to: ${why}`);
      if (value.allow_withdraw !== true) problems.push('A withdrawal destination is set but "Withdraw back" is off — turn it on, or clear the destination');
    }
    if (num(value.max_deposit_usd) !== undefined && value.allow_deposit !== true) {
      problems.push('"Most per deposit" is set but "Fund the venue from the wallet" is off — turn it on, or clear the amount');
    }
    return problems;
  },

  summarize(value: PolicyValue): string {
    const order = num(value.max_order_usd);
    const volume = num(value.max_daily_volume_usd);
    const markets = list(value.markets);
    const parts: string[] = [];
    if (order !== undefined && volume !== undefined) {
      const where = markets.length === 0 || markets.some((m) => m.toLowerCase() === 'any') ? 'any market' : `${markets.length} named market${markets.length === 1 ? '' : 's'}`;
      const open = num(value.max_open_notional_usd);
      parts.push(`The agent may trade ${where} up to ${usd(order)} per order and ${usd(volume)} a day${open !== undefined ? `, with at most ${usd(open)} open at once` : ''}`);
    } else {
      parts.push('The agent cannot place orders');
    }
    const deposit = value.allow_deposit === true;
    const withdraw = value.allow_withdraw === true;
    const maxDeposit = num(value.max_deposit_usd);
    const to = typeof value.withdraw_to === 'string' && value.withdraw_to.trim() ? value.withdraw_to.trim() : 'intents';
    if (deposit && withdraw) {
      parts.push(`it may fund the venue${maxDeposit !== undefined ? ` (up to ${usd(maxDeposit)} at a time)` : ''} and withdraw to ${to}`);
    } else if (deposit) {
      parts.push(`it may fund the venue${maxDeposit !== undefined ? ` (up to ${usd(maxDeposit)} at a time)` : ''} and cannot withdraw`);
    } else if (withdraw) {
      parts.push(`it may withdraw to ${to} and cannot fund the venue`);
    } else {
      parts.push('it can neither fund the venue nor withdraw');
    }
    return `${parts.join('; ')}.`;
  },
};
