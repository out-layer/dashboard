'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { APP_NAV, FOOTER_NAV } from '@/lib/nav';
import { DOCS_NAV } from '@/lib/docs-nav.mjs';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape' && open) onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <div
 className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[12vh]"
      onClick={() => onOpenChange(false)}
    >
 <div className="w-full max-w-lg px-4" onClick={(e) => e.stopPropagation()}>
        <Command
          label="Command palette"
 className="overflow-hidden rounded-xl border border-border-strong bg-card shadow-2xl"
        >
          <Command.Input
            autoFocus
            placeholder="Search pages and docs…"
 className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-faint-foreground"
          />
 <Command.List className="max-h-[50vh] overflow-y-auto p-2">
 <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing found.
            </Command.Empty>

            {[...APP_NAV, { group: 'General', items: FOOTER_NAV }].map((group) => (
              <Command.Group
                key={group.group ?? 'root'}
                heading={group.group ?? 'App'}
 className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint-foreground"
              >
                {group.items.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={`${group.group ?? ''} ${item.label}`}
                    onSelect={() => go(item.href)}
 className="cursor-pointer rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-accent/10 aria-selected:text-accent-text"
                  >
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            <Command.Group
              heading="Docs"
 className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint-foreground"
            >
              {DOCS_NAV.flatMap((g) => g.pages).map((page) => (
                <Command.Item
                  key={page.href}
                  value={`docs ${page.label}`}
                  onSelect={() => go(page.href)}
 className="cursor-pointer rounded-md px-3 py-2 text-sm text-foreground aria-selected:bg-accent/10 aria-selected:text-accent-text"
                >
                  {page.label}
 <span className="ml-2 text-xs text-faint-foreground">docs</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
