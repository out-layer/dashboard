// Canonical site origin — the ONE place that decides it. Used by root metadata
// (metadataBase), sitemap and robots. outlayer.fastnear.com still serves the
// same app from a second vhost, so links to it keep working; it is no longer
// what we publish.
export const SITE_ORIGIN = 'https://app.outlayer.ai';
