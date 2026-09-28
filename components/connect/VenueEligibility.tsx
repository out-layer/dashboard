import React from 'react';
import { ELIGIBILITY_NOTICE, type ConnectorEntry } from '@/lib/connectors';

/**
 * The eligibility notice for a venue that restricts who may use it: one
 * sentence of ours, the venue's own pages (the source — no country list is
 * kept here), and our Terms. `compact` is the catalog card's line; `children`
 * add what the page's own action means, on the owner's page.
 */
export function VenueEligibility({
  entry,
  compact = false,
  children,
}: {
  entry: ConnectorEntry;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  if (!entry.venueTerms || entry.venueTerms.length === 0) return null;
  return (
    <p
      className={
        compact ? 'text-xs text-amber-800' : 'rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900'
      }
    >
      <strong>Not available everywhere.</strong> {entry.name} {ELIGIBILITY_NOTICE}
      {children ? <> {children}</> : null}{' '}
      {entry.venueTerms.map((t, i) => (
        <span key={t.href}>
          {i > 0 ? ' · ' : ''}
          <a href={t.href} target="_blank" rel="noopener noreferrer" className="underline">
            {t.label}
          </a>
        </span>
      ))}
      {' · '}
      <a href="/terms#third-party" className="underline">
        OutLayer Terms
      </a>
    </p>
  );
}
