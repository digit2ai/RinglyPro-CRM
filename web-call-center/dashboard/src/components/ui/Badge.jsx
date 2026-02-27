import React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = {
  default: 'bg-primary text-primary-foreground',
  success: 'bg-green-100 text-green-800 border-green-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  danger: 'bg-red-100 text-red-800 border-red-200',
  outline: 'bg-transparent border text-foreground',
};

export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        badgeVariants[variant] || badgeVariants.default,
        className
      )}
      {...props}
    />
  );
}
