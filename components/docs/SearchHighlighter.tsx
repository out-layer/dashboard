'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const HL_NAME = 'search-hit';
const STYLE_ID = 'search-hit-style';

/* The build-time CSS parser (lightningcss) rejects ::highlight() selectors,
   so the rule is injected at runtime instead of living in globals.css. */
function ensureHighlightStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '::highlight(search-hit){background-color:rgba(204,102,0,.25);}' +
    '.dark ::highlight(search-hit){background-color:rgba(224,122,26,.35);}';
  document.head.appendChild(style);
}

/**
 * Highlights the ⌘K query words on a docs page. The palette appends `?q=…`
 * when a full-text result is opened; this walks the content's text nodes and
 * paints matches via the CSS Custom Highlight API — no DOM mutation, so React
 * never notices. A floating chip clears the highlight (removes ?q); a new
 * search simply replaces it. No-op in browsers without CSS.highlights.
 */
export function SearchHighlighter({ containerId }: { containerId: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const q = params.get('q')?.trim() ?? '';
  const [active, setActive] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registry = typeof CSS !== 'undefined' ? (CSS as any).highlights : undefined;
    if (!registry) return;
    ensureHighlightStyle();
    registry.delete(HL_NAME);
    setActive(false);
    if (!q) return;
    const words = [...new Set(q.toLowerCase().split(/\s+/).filter((w) => w.length >= 3))];
    if (words.length === 0) return;

    // Give the page a beat to render (and the hash-scroll to land).
    const t = setTimeout(() => {
      const root = document.getElementById(containerId);
      if (!root) return;
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode()) && ranges.length < 500) {
        const lower = (node.textContent || '').toLowerCase();
        for (const w of words) {
          let idx = 0;
          while ((idx = lower.indexOf(w, idx)) !== -1) {
            const r = new Range();
            r.setStart(node, idx);
            r.setEnd(node, idx + w.length);
            ranges.push(r);
            idx += w.length;
          }
        }
      }
      if (ranges.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registry.set(HL_NAME, new (window as any).Highlight(...ranges));
        setActive(true);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      registry.delete(HL_NAME);
    };
  }, [q, pathname, containerId]);

  if (!active) return null;

  const clear = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (CSS as any).highlights?.delete(HL_NAME);
    setActive(false);
    router.replace(pathname + window.location.hash, { scroll: false });
  };

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border-strong bg-card py-1.5 pl-3 pr-1.5 text-xs shadow-2xl">
      <span className="text-muted-foreground">
        Highlighting <b className="text-foreground">“{q}”</b>
      </span>
      <button
        type="button"
        aria-label="Clear highlighting"
        onClick={clear}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-card-muted hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
          <path d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
