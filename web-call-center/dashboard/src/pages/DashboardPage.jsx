import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { dashboardApi, callsApi } from '@/lib/api';
import { CallCenterCockpit } from '@/components/CallCenterCockpit';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatDuration } from '@/lib/utils';

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.getStats(),
  });

  const { data: recentCalls, isLoading: callsLoading } = useQuery({
    queryKey: ['recent-calls'],
    queryFn: () => callsApi.list({ limit: 10 }),
  });

  const dashStats = stats?.data || {};
  const calls = recentCalls?.data?.calls || [];
  const dailyVolume = dashStats.dailyVolume || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your web call center activity.
        </p>
      </div>

      {/* Glass Cockpit KPI Display */}
      <CallCenterCockpit stats={dashStats} isLoading={statsLoading} />

      {/* Daily call volume chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Call Volume (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {dailyVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyVolume}>
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
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="hsl(218, 70%, 14%)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              {statsLoading ? 'Loading chart data...' : 'No call data available yet.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent calls table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {calls.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Duration</th>
                    <th className="text-left py-3 px-2 font-medium text-muted-foreground">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 whitespace-nowrap">
                        {new Date(call.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-2 whitespace-nowrap">
                        {formatDuration(call.callDuration)}
                      </td>
                      <td className="py-3 px-2 text-muted-foreground truncate max-w-xs">
                        {call.callSummary || 'No summary available'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {callsLoading ? 'Loading calls...' : 'No calls recorded yet.'}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
