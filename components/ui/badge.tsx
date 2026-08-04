import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-accent/10 text-accent-text',
        success: 'bg-success/10 text-success-text',
        destructive: 'bg-destructive/10 text-destructive-text',
        // Warning shares the amber hue family with the accent — per the design
        // system it must NEVER appear without an icon + label (color alone is
        // ambiguous). Pass an icon child.
        warning: 'bg-warning/10 text-warning',
        info: 'bg-info/10 text-info',
        outline: 'border border-border-strong text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
