import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/site';
import { APP_NAV, FOOTER_NAV } from '@/lib/nav';
import { DOCS_NAV } from '@/lib/docs-nav.mjs';

export default function sitemap(): MetadataRoute.Sitemap {
  const appPaths = [
    ...APP_NAV.flatMap((g) => g.items.map((i) => i.href)),
    ...FOOTER_NAV.map((i) => i.href),
  ].filter((href) => href === '/' || !href.startsWith('/wallet') || href === '/wallet/manage');

  const docPaths = DOCS_NAV.flatMap((g) => g.pages.map((p) => p.href));

  return [...new Set([...appPaths, ...docPaths])].map((path) => ({
    url: `${SITE_ORIGIN}${path === '/' ? '' : path}`,
    changeFrequency: path.startsWith('/docs') ? 'weekly' : 'daily',
    priority: path === '/' ? 1 : path.startsWith('/docs') ? 0.7 : 0.6,
  }));
}
