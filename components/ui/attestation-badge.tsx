import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * The signature "proof affordance" of the dashboard: a TEE-attestation chip.
 * Appears wherever an execution, worker, or wallet is backed by an attested
 * enclave. Amber (brand accent) on purpose — attestation IS the brand — and
 * visually distinct from the green success/status palette: a job can be
 * `Failed` yet still `Attested` (the proof covers what ran, not whether it
 * succeeded).
 */
export interface AttestationBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  label?: string;
  /** Link to the attestation detail (e.g. `/attestation/{jobId}`). */
  href?: string;
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0" aria-hidden="true">
      <path d="M8 1 3 3v4.5C3 11 5.2 13.4 8 14.5c2.8-1.1 5-3.5 5-7V3zm-1 9.2L4.8 8l1-1 1.2 1.2 3.2-3.2 1 1z" />
    </svg>
  );
}

export function AttestationBadge({ label = 'Attested', href, className, ...props }: AttestationBadgeProps) {
  const chip = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-text whitespace-nowrap',
        href && 'hover:border-accent/60 transition-colors',
        className,
      )}
      {...props}
    >
      <ShieldIcon />
      {label}
    </span>
  );
  return href ? <Link href={href}>{chip}</Link> : chip;
}
