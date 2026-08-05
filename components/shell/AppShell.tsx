'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAV, FOOTER_NAV, isNavActive, type NavItem } from '@/lib/nav';
import PendingApprovalsBadge from '@/components/PendingApprovalsBadge';
import TestnetDisabledNotice from '@/components/TestnetDisabledNotice';
import NetworkSwitcher from '@/components/NetworkSwitcher';
import ThemeToggle from '@/components/shell/ThemeToggle';
import AccountChip from '@/components/shell/AccountChip';
import CommandPalette from '@/components/shell/CommandPalette';

function Brand() {
  return (
 <Link href="/" className="flex items-center gap-2 px-3 py-1">
 <span className="text-lg font-bold tracking-tight text-foreground">
 Out<span className="text-accent-text">Layer</span>
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src="/brand/mark-64.png" alt="" width={22} height={22} className="shrink-0" />
    </Link>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isNavActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
 className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-accent/10 font-semibold text-accent-text'
          : 'font-medium text-muted-foreground hover:bg-card-muted hover:text-foreground'
      }`}
    >
      {item.label}
      {item.approvalsBadge && <PendingApprovalsBadge />}
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
 <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
      {APP_NAV.map((group) => (
        <div key={group.group ?? 'root'}>
          {group.group && (
 <div className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-faint-foreground">
              {group.group}
            </div>
          )}
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
 <div className="mt-auto border-t border-border pt-2">
        {FOOTER_NAV.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer on navigation.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
 <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
 <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
 <div className="px-2 py-4">
          <Brand />
        </div>
        <SidebarNav />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
 <div className="fixed inset-0 z-[90] md:hidden">
 <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
 <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-border bg-card">
 <div className="flex items-center justify-between px-2 py-4">
              <Brand />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
 className="mr-2 p-2 text-muted-foreground hover:text-foreground"
              >
 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
 <div className="flex min-w-0 flex-1 flex-col">
        <TestnetDisabledNotice variant="banner" />

        {/* Topbar */}
 <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
 className="p-1.5 text-muted-foreground hover:text-foreground md:hidden"
          >
 <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <button
            onClick={() => setPaletteOpen(true)}
 className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-card-muted px-3 text-sm text-faint-foreground transition-colors hover:border-border-strong sm:flex cursor-pointer"
          >
 <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.6">
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            Search…
 <kbd className="ml-auto rounded border border-border-strong px-1.5 font-mono text-[10px]">⌘K</kbd>
          </button>

 <div className="flex-1" />

          <NetworkSwitcher />

          <Link
            href="/wallet/approvals"
            aria-label="Pending approvals"
 className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
 <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2a4 4 0 0 0-4 4c0 3-1.2 4-1.2 4h10.4S12 9 12 6a4 4 0 0 0-4-4zM6.6 13a1.5 1.5 0 0 0 2.8 0" />
            </svg>
 <span className="absolute -right-1.5 -top-1.5">
              <PendingApprovalsBadge />
            </span>
          </Link>

          <ThemeToggle />
          <AccountChip />
        </header>

 <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>

        <footer className="border-t border-border px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <p>© 2026 OutLayer · Verifiable compute and custody for AI agents</p>
            <nav className="flex flex-wrap items-center gap-4">
              <Link href="/docs/getting-started" className="hover:text-foreground">
                Docs
              </Link>
              <Link href="/workers" className="hover:text-foreground">
                Workers
              </Link>
              <a
                href="https://github.com/out-layer"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                GitHub
              </a>
              <a
                href="https://x.com/out_layer"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                X
              </a>
            </nav>
          </div>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
