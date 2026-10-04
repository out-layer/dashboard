'use client';

import React, { useState } from 'react';
import type { ConnectorEntry } from '@/lib/connectors';
import { VenueEligibility } from '@/components/connect/VenueEligibility';

/** The small bordered chip a connector's header uses for "Specs" — the same look for "Terms". */
export const HEADER_CHIP =
  'shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-accent hover:text-foreground';

/**
 * "Terms" for a venue that restricts who may use it: a chip that opens the
 * eligibility notice, so the notice is one click away instead of a block in
 * the middle of the form. `children` is what this page's own action means (on
 * the owner's page: storing a policy confirms the owner and the agent may
 * trade); it stays visible next to the chip.
 */
export function VenueTerms({ entry, children }: { entry: ConnectorEntry; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!entry.venueTerms || entry.venueTerms.length === 0) return children ? <p>{children}</p> : null;
  return (
    <div className="space-y-2">
      <p>
        {children ? <>{children} </> : null}
        <button type="button" className={HEADER_CHIP} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Terms
        </button>
      </p>
      {open && <VenueEligibility entry={entry} />}
    </div>
  );
}
