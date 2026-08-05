import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard page header (DESIGN.md "Page skeleton"): h1 = sidebar label,
 * one factual sentence, optional single right-aligned action.
 *
 * The double stroke on the left is the OutLayer "layer shift" mark: the faint
 * bar is the base layer, the amber one is the same stroke moved out in front —
 * the » of the wordmark, verticalized. It also puts the h1 on the same
 * vertical line as card content (pl-5 = CardHeader padding), so the page reads
 * as one aligned column. On hover the strokes trade places; transitions (not
 * keyframes) so leaving mid-swap smoothly reverses from wherever it got to.
 */
export interface PageHeaderProps {
  /** Must equal the sidebar label ("Vaults", not "Manage Vaults"). */
  title: string;
  /** Inline chip after the title (e.g. pending-approvals count). */
  badge?: React.ReactNode;
  description?: React.ReactNode;
  /** ONE primary action, right-aligned. */
  action?: React.ReactNode;
  className?: string;
}

const STROKE_CLS =
  'absolute w-[3px] rounded-full transition-transform duration-300 ease-in-out motion-reduce:transition-none';

export function PageHeader({ title, badge, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 sm:flex sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="group relative w-fit pl-5">
        <span
          aria-hidden="true"
          className={cn(
            STROKE_CLS,
            'bottom-0.5 left-0 top-[9px] bg-border-strong',
            'group-hover:translate-x-[7px] group-hover:-translate-y-[7px]',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            STROKE_CLS,
            'bottom-[9px] left-[7px] top-0.5 bg-gradient-to-b from-accent to-accent/40',
            'group-hover:-translate-x-[7px] group-hover:translate-y-[7px]',
          )}
        />
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          {title}
          {badge}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-3 shrink-0 sm:mt-0">{action}</div>}
    </div>
  );
}
