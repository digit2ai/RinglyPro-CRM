import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, TrendingUp, Zap } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { usageApi } from '@/lib/api';
import { UsageMeter } from '@/components/UsageMeter';
import { StatCard } from '@/components/StatCard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatMinutes } from '@/lib/utils';

export function UsagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['usage'],
    queryFn: () => usageApi.get(),
  });

  const usage = data?.data || {};
  const dailyUsage = usage.dailyUsage || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usage & Billing</h1>
        <p className="text-muted-foreground">
          Monitor your call center usage and billing information.
        </p>
      </div>

      {/* Large usage meter */}
      <UsageMeter
        used={usage.minutesUsed || 0}
        total={usage.minutesTotal || 1000}
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={TrendingUp}
          title="Average Daily Usage"
          value={isLoading ? '...' : formatMinutes(usage.avgDailyUsage || 0)}
          subtitle="This billing period"
        />
        <StatCard
          icon={Zap}
          title="Peak Day"
          value={isLoading ? '...' : formatMinutes(usage.peakDayMinutes || 0)}
          subtitle={usage.peakDayDate ? new Date(usage.peakDayDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
        />
        <StatCard
          icon={Calendar}
          title="Days Remaining"
          value={isLoading ? '...' : (usage.daysRemaining || 0)}
          subtitle="In billing period"
        />
      </div>

      {/* Daily usage bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Usage This Month</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyUsage.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={dailyUsage}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'Minutes',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 12, fill: 'hsl(var(--muted-foreground))' },
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`${value} min`, 'Usage']}
                />
                <Bar
                  dataKey="minutes"
                  fill="hsl(243, 75%, 59%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[350px] text-muted-foreground">
              {isLoading ? 'Loading usage data...' : 'No usage data available yet.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
