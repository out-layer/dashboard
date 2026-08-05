// App navigation registry: the sidebar and the ⌘K palette both render from
// this. Grouped by capability (not by internal component names) — same model
// as the landing pillars and the docs.

export interface NavItem {
  href: string;
  label: string;
  /** Pathname prefix that marks this item active (defaults to href). */
  match?: string;
  /** Render the pending-approvals badge next to the label. */
  approvalsBadge?: boolean;
}

export interface NavGroup {
  group: string | null;
  items: NavItem[];
}

export const APP_NAV: NavGroup[] = [
  {
    group: null,
    items: [{ href: '/', label: 'Overview', match: '/__overview__' }],
  },
  {
    group: 'Compute',
    items: [
      { href: '/playground', label: 'Playground' },
      { href: '/projects', label: 'Projects' },
      { href: '/executions', label: 'Executions' },
      { href: '/secrets', label: 'Secrets' },
    ],
  },
  {
    group: 'Custody',
    items: [
      { href: '/wallet/manage', label: 'Wallets' },
      { href: '/wallet/approvals', label: 'Approvals', approvalsBadge: true },
      { href: '/vault', label: 'Vaults' },
      { href: '/wallet/audit', label: 'Audit log' },
    ],
  },
  {
    group: 'Payments',
    items: [
      { href: '/payment-keys', label: 'Payment keys' },
      { href: '/earnings', label: 'Earnings' },
    ],
  },
  {
    group: 'Network',
    items: [
      { href: '/workers', label: 'Workers' },
      { href: '/stats', label: 'Stats' },
    ],
  },
  {
    group: 'Ecosystem',
    items: [{ href: '/products', label: 'Products' }],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { href: '/docs/getting-started', label: 'Docs', match: '/docs' },
  { href: '/settings', label: 'Settings' },
];

/** Active check: exact for '/', prefix otherwise. */
export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/';
  const match = item.match ?? item.href;
  return pathname === match || pathname.startsWith(match + '/') || pathname === item.href;
}
