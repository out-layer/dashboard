import type { PolicySchema, PolicyValue } from './types';

/**
 * The Hyperliquid connector's policy — the owner's caps on what an agent may
 * trade from its own wallet. Mirrors
 * `connectors/hyperliquid-connector/src/policy.rs`: the keys, what absence
 * means, and the fail-closed rules.
 *
 * It FAILS CLOSED. No policy, or a policy that names no size, is read-only:
 * markets, positions and fills answer; nothing is placed. An order needs
 * `max_order_usd`, `max_daily_volume_usd` AND `max_leverage` — the last one
 * because a fresh Hyperliquid account trades at the market's maximum leverage
 * until something sets it. Deposits and withdrawals are switches, off until
 * turned on. So every grant here says what is withheld, and the empty policy
 * is described as "read-only", never as "no limits".
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

/** A coin as Hyperliquid names it: letters and digits, or "any". */
export function coinProblem(entry: string): string | null {
  const coin = entry.trim();
  if (coin.toLowerCase() === 'any') return null;
  return /^[A-Za-z0-9:_-]{1,20}$/.test(coin) ? null : `"${entry}" is not a coin symbol (BTC, ETH, …)`;
}

/** `intents`, `confidential`, or a HyperCore address (0x + 40 hex). */
export function withdrawToProblem(entry: string): string | null {
  const to = entry.trim();
  if (to === 'intents' || to === 'confidential' || /^0x[0-9a-fA-F]{40}$/.test(to)) return null;
  return 'Write intents, confidential, or a HyperCore address (0x…, 40 hex characters)';
}

export const hyperliquidPolicy: PolicySchema = {
  connector: 'hyperliquid',
  envKey: 'HYPERLIQUID_POLICY',
  emptySummary: 'read-only — the agent can read markets, positions and fills, and cannot place an order, set leverage, deposit or withdraw',
  groups: [
    {
      question: 'How much may it trade?',
      fields: [
        {
          key: 'max_order_usd',
          label: 'Most per order',
          kind: 'number',
          unit: 'USD notional, whole dollars',
          help: 'Price × size of one order. Not applied to a reduce-only order: closing must always be possible in one order. Orders are off until this, the daily volume and the leverage cap are all set.',
          absentMeans: 'Empty: no orders at all.',
          min: 1,
        },
        {
          key: 'max_daily_volume_usd',
          label: 'Volume per day',
          kind: 'number',
          unit: 'USD notional, UTC days',
          help: 'Everything the agent asked to trade in a UTC day, counted whether or not it filled. A reduce-only order is counted but never refused by it.',
          absentMeans: 'Empty: no orders at all.',
          min: 1,
        },
        {
          key: 'max_leverage',
          label: 'Leverage up to',
          kind: 'number',
          unit: '×',
          help: 'The most the agent may set, and the most a position may carry when an order adds to it. Required even for orders: a fresh account trades at the market’s MAXIMUM leverage until something sets it.',
          absentMeans: 'Empty: no orders and no leverage change at all.',
          min: 1,
        },
        {
          key: 'max_position_notional_usd',
          label: 'Position up to',
          kind: 'number',
          unit: 'USD notional per coin',
          help: 'The size a coin’s position may reach after an order.',
          absentMeans: 'Empty: no cap on position size (the three above still apply).',
          min: 1,
        },
      ],
    },
    {
      question: 'Which coins?',
      fields: [
        {
          key: 'coins',
          label: 'Only these coins',
          kind: 'list',
          help: 'Hyperliquid symbols. "any" means every listed market.',
          absentMeans: 'Empty: every listed market.',
          placeholder: 'BTC',
          normalize: (e) => e.trim().toUpperCase().replace(/^ANY$/, 'any'),
          validateEntry: coinProblem,
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
          help: 'Lets the agent move USDC from the wallet’s intents balance to Hyperliquid. Each deposit is one request the agent makes; the cap below bounds it.',
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
          help: 'Lets the agent move USDC from Hyperliquid back out.',
          absentMeans: 'Off: nothing leaves the venue.',
        },
        {
          key: 'withdraw_to',
          label: 'Withdraw only to',
          kind: 'text',
          help: 'intents (the wallet’s own balance), confidential, or one HyperCore address. With this set, no other destination is accepted.',
          absentMeans: 'Empty: the destination the agent names on each withdrawal.',
          placeholder: 'intents',
        },
      ],
    },
  ],

  check(value: PolicyValue): string[] {
    const problems: string[] = [];
    const order = num(value.max_order_usd);
    const volume = num(value.max_daily_volume_usd);
    const leverage = num(value.max_leverage);
    const set = [order, volume, leverage].filter((v) => v !== undefined).length;
    if (set > 0 && set < 3) {
      problems.push('Orders need all three: "Most per order", "Volume per day" and "Leverage up to" — with any of them missing nothing is placed');
    }
    if (order !== undefined && volume !== undefined && order > volume) {
      problems.push('"Most per order" is larger than the day’s volume, so no order of that size could ever run');
    }
    if (typeof value.withdraw_to === 'string' && value.withdraw_to.trim()) {
      const why = withdrawToProblem(value.withdraw_to);
      if (why) problems.push(`Withdraw only to: ${why}`);
    }
    if (typeof value.withdraw_to === 'string' && value.withdraw_to.trim() && value.allow_withdraw !== true) {
      problems.push('A withdrawal destination is set but "Withdraw back" is off — turn it on, or clear the destination');
    }
    if (num(value.max_deposit_usd) !== undefined && value.allow_deposit !== true) {
      problems.push('"Most per deposit" is set but "Fund the venue from the wallet" is off — turn it on, or clear the amount');
    }
    return problems;
  },

  summarize(value: PolicyValue): string {
    const order = num(value.max_order_usd);
    const volume = num(value.max_daily_volume_usd);
    const leverage = num(value.max_leverage);
    const coins = list(value.coins);
    const parts: string[] = [];
    if (order !== undefined && volume !== undefined && leverage !== undefined) {
      const where = coins.length === 0 || coins.some((c) => c.toLowerCase() === 'any') ? 'any listed market' : coins.join(', ');
      const position = num(value.max_position_notional_usd);
      parts.push(
        `The agent may trade ${where} up to ${usd(order)} per order and ${usd(volume)} a day at up to ${leverage}× leverage${position !== undefined ? `, positions up to ${usd(position)} per coin` : ''}`,
      );
    } else {
      parts.push('The agent cannot place orders or set leverage');
    }
    const deposit = value.allow_deposit === true;
    const withdraw = value.allow_withdraw === true;
    const maxDeposit = num(value.max_deposit_usd);
    const to = typeof value.withdraw_to === 'string' ? value.withdraw_to.trim() : '';
    if (deposit && withdraw) {
      parts.push(`it may fund the venue${maxDeposit !== undefined ? ` (up to ${usd(maxDeposit)} at a time)` : ''} and withdraw${to ? ` only to ${to}` : ''}`);
    } else if (deposit) {
      parts.push(`it may fund the venue${maxDeposit !== undefined ? ` (up to ${usd(maxDeposit)} at a time)` : ''} and cannot withdraw`);
    } else if (withdraw) {
      parts.push(`it may withdraw${to ? ` only to ${to}` : ''} and cannot fund the venue`);
    } else {
      parts.push('it can neither fund the venue nor withdraw');
    }
    return `${parts.join('; ')}.`;
  },
};
