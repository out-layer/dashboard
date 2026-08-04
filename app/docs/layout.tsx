'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { DOCS_NAV } from '@/lib/docs-nav.mjs';

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
 <h1 className="text-3xl font-bold mb-8 text-foreground">OutLayer Documentation</h1>

 <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Navigation */}
 <div className="lg:col-span-1">
 <div className="bg-card border border-border rounded-lg p-2">
 <nav className="space-y-0.5">
              {DOCS_NAV.map((group) => (
                <div key={group.group ?? 'root'}>
                  {group.group && (
 <div className="pt-3 pb-1">
 <span className="px-3 text-xs font-semibold text-faint-foreground uppercase tracking-wider">
                        {group.group}
                      </span>
                    </div>
                  )}
                  {group.pages.map((page) => (
                    <div key={page.href}>
                      <Link
                        href={page.href}
 className={`flex items-center justify-between w-full text-left px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          isActive(page.href)
                            ? 'bg-accent/10 text-accent-text font-semibold'
                            : 'text-foreground hover:bg-card-muted'
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
 className={`w-4 h-4 transition-transform ${expandedPages[page.href] ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </Link>
                      {expandedPages[page.href] && page.sections.length > 0 && (
 <div className="ml-4 mt-1 space-y-0.5">
                          {page.sections.map((section) => (
                            <button
                              key={section.id}
                              onClick={() => scrollToSection(section.id)}
 className="block w-full text-left px-3 py-1 text-xs text-muted-foreground hover:text-accent-text hover:bg-card-muted rounded transition-colors cursor-pointer"
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
 <div className="lg:col-span-3">
 <div className="bg-card border border-border rounded-lg p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
