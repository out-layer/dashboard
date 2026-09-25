// The connector library as the dashboard shows it on /connectors: what each
// connector does, where its owner connects (when there is a page for that), and
// the skill an agent reads. Copy mirrors `outlayer-connectors/SKILL.md` in the
// skills repo — the one place the library is described for agents; keep the two
// in sync when a connector is added or moves network.

import type { ExampleIconName } from '@/components/ui/example-icon';

export interface ConnectorEntry {
  /** The connector id: the project is `connectors.outlayer.{near,testnet}/<id>`. */
  id: string;
  name: string;
  /** One line: what an agent can do with it, as the owner would say it. */
  tagline: string;
  /** What the owner gives it, and what keeps that safe. */
  how: string;
  /** The owner's page. */
  connectHref: string;
  /**
   * `account`: the owner connects an account of theirs and grants agents.
   * `policy`: there is no account — the agent's venue key is a sub-key of its
   * own wallet — and the owner's page stores the caps under the agent instead.
   */
  owner: 'account' | 'policy';
  /** Where it runs today. */
  networks: ('mainnet' | 'testnet')[];
  /** The card's glyph — a stroke icon, not the service's trademark. */
  icon: ExampleIconName;
}

export const SKILLS_BASE = 'https://skills.outlayer.ai';
/** How any connector is called and paid — the skill every connector's skill leans on. */
export const CONNECTORS_LIBRARY_SKILL = `${SKILLS_BASE}/outlayer-connectors/SKILL.md`;

export function skillUrl(id: string): string {
  return `${SKILLS_BASE}/${id}-connector/SKILL.md`;
}

export const CONNECTORS: ConnectorEntry[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Send mail from your own address — to the recipients you allow, and nothing else.',
    how: 'You connect your Google account once; the credential is send-only and cannot read the mailbox. Your policy names who may be written to, how many messages a day, and whether attachments go.',
    connectHref: '/connect/gmail',
    owner: 'account',
    networks: ['mainnet', 'testnet'],
    icon: 'mail',
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Issues, comments, commits, pull requests, reviews and gists — in your account, under your name.',
    how: 'You install the OutLayer app on the repositories you choose; that is the outer fence. Your policy narrows it: which actions, branches and paths, how many writes a day, and whether it may ever merge.',
    connectHref: '/connect/github',
    owner: 'account',
    networks: ['mainnet', 'testnet'],
    icon: 'branch',
  },
  {
    id: 'mercury',
    name: 'Mercury Bank',
    tagline: 'Pay a contractor, issue an invoice, read the ledger — from your business bank account, inside your limits.',
    how: 'You paste an API token from Mercury; a token alone moves nothing. Your policy sets the most per payment and per 30 days, the payees and rails, and Mercury’s own approval rules still apply on top.',
    connectHref: '/connect/mercury',
    owner: 'account',
    networks: ['mainnet', 'testnet'],
    icon: 'bank',
  },
  {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    tagline: 'Perpetuals from the agent’s own wallet: leverage, limit and market orders, positions, funding in and out.',
    how: 'No account to connect: the venue key is a sub-key of the agent’s custody wallet, held in the enclave. Your caps are a policy you store for the agent; without one it is read-only.',
    connectHref: '/connect/hyperliquid',
    owner: 'policy',
    networks: ['mainnet'],
    icon: 'candles',
  },
  {
    id: 'polymarket',
    name: 'Polymarket',
    tagline: 'A position on a real-world outcome: find the market, buy or sell shares, claim when it resolves.',
    how: 'No account to connect: the venue key is a sub-key of the agent’s custody wallet. Your caps are a policy you store for the agent; without one it can only read and cancel.',
    connectHref: '/connect/polymarket',
    owner: 'policy',
    networks: ['mainnet'],
    icon: 'dice',
  },
];
