import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

export function UsageMeter({ used = 0, total = 1000, className }) {
  const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  const getBarColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getTextColor = () => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Minutes Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Usage numbers */}
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-bold">{Math.round(used)}</span>
            <span className="text-sm text-muted-foreground">
              / {total.toLocaleString()} minutes
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-500', getBarColor())}
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Percentage */}
          <div className="flex items-center justify-between text-sm">
            <span className={cn('font-medium', getTextColor())}>
              {percentage.toFixed(1)}% used
            </span>
            <span className="text-muted-foreground">
              {Math.round(total - used)} minutes remaining
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
