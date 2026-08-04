import type { MetadataRoute } from 'next';
import { SITE_ORIGIN } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Utility pages that carry wallet keys in their URLs.
      disallow: ['/wallet?', '/wallet/fund'],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
