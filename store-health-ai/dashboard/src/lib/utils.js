import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage
 */
export function formatPercent(value, decimals = 1) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

/**
 * Get status color classes
 */
export function getStatusColor(status) {
  const colors = {
    green: 'bg-success text-success-foreground',
    yellow: 'bg-warning text-warning-foreground',
    red: 'bg-danger text-danger-foreground',
    active: 'bg-primary text-primary-foreground',
    pending: 'bg-yellow-500 text-white',
    completed: 'bg-success text-success-foreground',
    failed: 'bg-danger text-danger-foreground',
  };
  return colors[status] || 'bg-gray-500 text-white';
}

/**
 * Get status badge color classes
 */
export function getStatusBadgeColor(status) {
  const colors = {
    green: 'bg-green-100 text-green-800 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    active: 'bg-blue-100 text-blue-800 border-blue-200',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    acknowledged: 'bg-purple-100 text-purple-800 border-purple-200',
  };
  return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
}

/**
 * Get escalation level label
 */
export function getEscalationLevelLabel(level) {
  const labels = {
    0: 'Green - Monitoring',
    1: 'Yellow - Task Created',
    2: 'Red - Alert Active',
    3: 'Critical - AI Call Initiated',
    4: 'Regional Escalation',
  };
  return labels[level] || `Level ${level}`;
}

/**
 * Get severity icon
 */
export function getSeverityIcon(severity) {
  const icons = {
    green: '🟢',
    yellow: '🟡',
    red: '🔴',
    critical: '⚠️',
  };
  return icons[severity] || '';
}
