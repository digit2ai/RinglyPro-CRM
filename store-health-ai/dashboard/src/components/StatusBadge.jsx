import React from 'react';
import { Badge } from './ui/Badge';
import { getSeverityIcon } from '@/lib/utils';

export function StatusBadge({ status, children }) {
  const variantMap = {
    green: 'success',
    yellow: 'warning',
    red: 'danger',
    critical: 'danger',
    active: 'default',
    pending: 'warning',
    completed: 'success',
    acknowledged: 'secondary',
    resolved: 'success',
    failed: 'danger',
  };

  const variant = variantMap[status?.toLowerCase()] || 'default';
  const icon = getSeverityIcon(status?.toLowerCase());

  return (
    <Badge variant={variant}>
      {icon && <span className="mr-1">{icon}</span>}
      {children || status}
    </Badge>
  );
}
