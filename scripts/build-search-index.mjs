// Build-time full-text search index for the ⌘K palette.
//
// Runs as `postbuild`: reads the docs pages Next has just prerendered to
// .next/server/app/**/*.html, slices each page into its DOCS_NAV sections by
// their `id=` anchors, strips markup, and writes a compact JSON array to
// public/search-index.json (untracked — regenerated on every build; `next
// start` serves public/ live, so writing after `next build` is fine).
// CommandPalette lazy-fetches it on the first ≥3-char query. No backend.

import fs from 'node:fs';
import path from 'node:path';
import { DOCS_NAV } from '../lib/docs-nav.mjs';

const root = process.cwd();
const outFile = path.join(root, 'public', 'search-index.json');
const MAX_SECTION_CHARS = 1500;

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageHtmlPath(href) {
  return path.join(root, '.next', 'server', 'app', ...href.split('/').filter(Boolean)) + '.html';
}

const entries = [];
let missing = 0;

for (const group of DOCS_NAV) {
  for (const page of group.pages) {
    const file = pageHtmlPath(page.href);
    if (!fs.existsSync(file)) {
      missing++;
      console.warn(`search-index: no prerendered HTML for ${page.href}`);
      continue;
    }
    const html = fs.readFileSync(file, 'utf8');

    // Locate each section anchor; slices run anchor→next anchor, so they skip
    // the shell/sidebar markup that precedes the content in the document.
    const positions = [];
    for (const s of page.sections) {
      const m = html.match(new RegExp(`id=["']${s.id}["']`));
      if (m) positions.push({ id: s.id, title: s.title, pos: m.index });
    }
    positions.sort((a, b) => a.pos - b.pos);

    if (positions.length === 0) {
      // Page without section anchors: index from its first h1 onward.
      const h1 = html.indexOf('<h1');
      const text = htmlToText(html.slice(h1 >= 0 ? h1 : 0)).slice(0, MAX_SECTION_CHARS);
      if (text) entries.push({ href: page.href, page: page.label, id: '', title: page.label, text });
      continue;
    }

    positions.forEach((s, i) => {
      // Start after the anchor's own tag so the text doesn't open with `id="…">`.
      const tagEnd = html.indexOf('>', s.pos);
      const start = tagEnd >= 0 ? tagEnd + 1 : s.pos;
      const end = i + 1 < positions.length ? positions[i + 1].pos : html.length;
      const text = htmlToText(html.slice(start, end)).slice(0, MAX_SECTION_CHARS);
      if (text) entries.push({ href: page.href, page: page.label, id: s.id, title: s.title, text });
    });
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(entries));
const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(
  `search-index: ${entries.length} entries (${kb} KB)${missing ? `, ${missing} pages without HTML` : ''} → public/search-index.json`,
);
