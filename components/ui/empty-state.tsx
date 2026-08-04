import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Unified empty state: one sentence about what belongs here + how to create it.
 * Every empty table/list in the app renders this instead of bespoke markup.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Primary action (a <Button> or link). */
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action, className, children, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-card px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon && <div className="mb-1 text-faint-foreground">{icon}</div>}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {children}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
