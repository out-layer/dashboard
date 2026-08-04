'use client';

import Link from 'next/link';
import { useState } from 'react';
import PendingApprovalsBadge from '@/components/PendingApprovalsBadge';

const NAV_LINKS = [
  { href: '/docs', label: 'Docs' },
  { href: '/executions', label: 'Executions' },
  { href: '/stats', label: 'Stats' },
  { href: '/playground', label: 'Playground' },
] as const;

const WORKSPACE_LINKS = [
  { href: '/workspace', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
  { href: '/secrets', label: 'Secrets' },
  { href: '/payment-keys', label: 'Payment Keys' },
  { href: '/vault', label: 'Vaults' },
  { href: '/earnings', label: 'Earnings' },
] as const;

export default function AppHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="relative z-50 bg-card shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-8">
            {/* Wordmark first, goldfish mark after it (brand rule) */}
            <Link href="/" className="inline-flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-foreground">
                Out<span className="text-accent-text">Layer</span>
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/mark-64.png" alt="" width={26} height={26} className="shrink-0" />
            </Link>
            {/* Desktop menu - left side */}
            <div className="hidden md:flex space-x-4">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-foreground hover:text-accent-text px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Desktop menu - right side with dropdown */}
          <div className="hidden md:flex items-center">
            <div className="relative group">
              <Link
                href="/workspace"
                className="text-foreground hover:text-accent-text px-3 py-2 text-sm font-medium transition-colors border border-border hover:border-accent rounded-lg inline-flex items-center gap-1"
              >
                My Workspace
                <PendingApprovalsBadge />
                <svg className="w-4 h-4 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Link>
              {/* Dropdown menu */}
              <div className="absolute right-0 mt-1 w-48 bg-card rounded-lg shadow-lg border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50">
                <div className="py-1">
                  {WORKSPACE_LINKS.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="block px-4 py-2 text-sm text-foreground hover:bg-card-muted hover:text-accent-text"
                    >
                      {l.label}
                    </Link>
                  ))}
                  <div className="border-t border-border my-1"></div>
                  <Link href="/wallet/manage" className="block px-4 py-2 text-sm text-foreground hover:bg-card-muted hover:text-accent-text">
                    Wallet Management
                  </Link>
                  <Link href="/wallet/approvals" className="flex items-center px-4 py-2 text-sm text-foreground hover:bg-card-muted hover:text-accent-text">
                    Wallet Approvals
                    <PendingApprovalsBadge />
                  </Link>
                  <div className="border-t border-border my-1"></div>
                  <Link href="/settings" className="block px-4 py-2 text-sm text-foreground hover:bg-card-muted hover:text-accent-text">
                    Settings
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-foreground hover:text-accent-text p-2"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu — full parity with desktop, including workspace pages */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4">
            <div className="flex flex-col space-y-1">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-foreground hover:text-accent-text px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {l.label}
                </Link>
              ))}
              <div className="border-t border-border my-1"></div>
              {WORKSPACE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-foreground hover:text-accent-text px-3 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {l.label}
                </Link>
              ))}
              <div className="border-t border-border my-1"></div>
              <Link
                href="/wallet/manage"
                onClick={() => setMobileMenuOpen(false)}
                className="text-foreground hover:text-accent-text px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Wallet Management
              </Link>
              <Link
                href="/wallet/approvals"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center text-foreground hover:text-accent-text px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Wallet Approvals
                <PendingApprovalsBadge />
              </Link>
              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="text-foreground hover:text-accent-text px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Settings
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
