'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { DOCS_NAV } from '@/lib/docs-nav.mjs';
import { PageHeader } from '@/components/ui/page-header';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [expandedPages, setExpandedPages] = useState<Record<string, boolean>>({
    [pathname]: true, // Auto-expand current page
  });

  const allPages = DOCS_NAV.flatMap((g) => g.pages);
  const hasSections = (href: string) =>
    (allPages.find((p) => p.href === href)?.sections.length ?? 0) > 0;

  // Auto-expand only current page when pathname changes
  useEffect(() => {
    if (allPages.some((p) => p.href === pathname && p.sections.length > 0)) {
      setExpandedPages({ [pathname]: true }); // Only current page
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isActive = (path: string) => pathname === path;

  const toggleExpand = (path: string) => {
    setExpandedPages((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL with hash
      window.history.pushState(null, '', `#${sectionId}`);
    }
  };

  return (
    <div className="w-full">
      <PageHeader
        title="Documentation"
        description="Guides and reference for OutLayer verifiable compute and agent custody."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        {/* Sidebar Navigation: collapsible drawer on mobile, compact rail on lg+ */}
        <details className="group mb-2 rounded-lg border border-border bg-card lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold">
            Docs navigation
            <svg className="h-4 w-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M19 9l-7 7-7-7" /></svg>
          </summary>
          <div className="border-t border-border p-2">
            <MobileDocsNav pathname={pathname} />
          </div>
        </details>
        <div className="hidden lg:block">
          <div className="rounded-lg border border-border bg-card p-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <nav className="space-y-0.5">
              {DOCS_NAV.map((group) => (
                <div key={group.group ?? 'root'}>
                  {group.group && (
                    <div className="pb-1 pt-3">
                      <span className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">
                        {group.group}
                      </span>
                    </div>
                  )}
                  {group.pages.map((page) => (
                    <div key={page.href}>
                      <Link
                        href={page.href}
                        className={`flex w-full items-center justify-between rounded-md border px-2.5 py-1 text-left text-sm font-medium transition-colors ${
                          isActive(page.href)
                            ? 'border-accent bg-accent/10 text-accent-text'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-card-muted'
                        }`}
                        onClick={(e) => {
                          if (isActive(page.href)) {
                            e.preventDefault();
                            toggleExpand(page.href);
                          }
                        }}
                      >
                        <span>{page.label}</span>
                        {hasSections(page.href) && (
                          <svg
                            className={`h-3.5 w-3.5 shrink-0 transition-transform ${expandedPages[page.href] ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </Link>
                      {expandedPages[page.href] && page.sections.length > 0 && (
                        <div className="ml-3 mt-1 space-y-0.5 border-l border-border pl-2">
                          {page.sections.map((section) => (
                            <button
                              key={section.id}
                              onClick={() => scrollToSection(section.id)}
                              className="block w-full rounded px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-card-muted hover:text-accent-text"
                            >
                              {section.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="min-w-0">
          <div className="rounded-lg border border-border bg-card p-4 sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

function MobileDocsNav({ pathname }: { pathname: string }) {
  return (
    <nav className="space-y-0.5">
      {DOCS_NAV.map((group) => (
        <div key={group.group ?? 'root'}>
          {group.group && (
            <div className="pb-1 pt-3">
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-faint-foreground">
                {group.group}
              </span>
            </div>
          )}
          {group.pages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className={`block rounded-md px-3 py-1.5 text-sm font-medium ${
                pathname === page.href
                  ? 'bg-accent/10 text-accent-text'
                  : 'text-muted-foreground hover:bg-card-muted hover:text-foreground'
              }`}
            >
              {page.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
