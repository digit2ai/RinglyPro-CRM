import React, { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, storeApi } from '@/lib/api';
import { useAlertUpdates, useKpiUpdates } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StoreHealthCard } from '@/components/StoreHealthCard';
import { CriticalIndicators } from '@/components/CriticalIndicators';
import { TrafficLight } from '@/components/TrafficLight';
import { AIAgentOrb } from '@/components/AIAgentOrb';
import { Loading } from '@/components/Loading';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Store, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { format, parseISO } from 'date-fns';

export function DashboardPage() {
  const queryClient = useQueryClient();

  // Fetch dashboard overview
  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => dashboardApi.getOverview(),
  });

  // Fetch critical stores
  const {
    data: criticalStores,
    isLoading: criticalLoading,
    error: criticalError,
  } = useQuery({
    queryKey: ['dashboard', 'critical-stores'],
    queryFn: () => dashboardApi.getCriticalStores(null, 10),
  });

  // Fetch KPI trends (last 7 days)
  const {
    data: kpiTrends,
    isLoading: trendsLoading,
  } = useQuery({
    queryKey: ['dashboard', 'kpi-trends'],
    queryFn: () => dashboardApi.getKpiTrends(7),
  });

  // Fetch top issues
  const {
    data: topIssues,
    isLoading: issuesLoading,
  } = useQuery({
    queryKey: ['dashboard', 'top-issues'],
    queryFn: () => dashboardApi.getTopIssues(null, 5),
  });

  // Real-time updates
  const handleRealtimeUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  useAlertUpdates(handleRealtimeUpdate);
  useKpiUpdates(handleRealtimeUpdate);

  if (overviewLoading) {
    return <Loading message="Loading dashboard..." />;
  }

  if (overviewError) {
    return <ErrorMessage error={overviewError} retry={refetchOverview} />;
  }

  const stats = overview?.data || {};

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-muted-foreground">
              Real-time store health monitoring and alerts
            </p>
            <TrafficLight
              redStores={stats.red_stores || 0}
              yellowStores={stats.yellow_stores || 0}
              greenStores={stats.green_stores || 0}
              totalStores={stats.total_stores || 0}
            />
          </div>
        </div>
        <AIAgentOrb agentUrl="https://elevenlabs.io/app/agents/agents/agent_3701kgg7d7v3e1vbjsxv0p5pn48e?branchId=agtbrch_9301kgg7d82ce4ct863x1n92ygdz&tab=widget" />
      </div>

      {/* Critical Flight Indicators */}
      <CriticalIndicators dashboardData={stats} />

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_stores || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active locations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Green Stores</CardTitle>
            <div className="h-3 w-3 rounded-full bg-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {stats.green_stores || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Performing well
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yellow/Red Stores</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-danger">
              {(stats.yellow_stores || 0) + (stats.red_stores || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.yellow_stores || 0} yellow, {stats.red_stores || 0} red
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Health Score</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.average_health_score?.toFixed(1) || '0.0'}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${stats.average_health_score || 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Stores */}
      {criticalStores?.data && criticalStores.data.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">Critical Stores</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {criticalStores.data.map((snapshot) => (
              <StoreHealthCard
                key={snapshot.id}
                store={snapshot.store}
                snapshot={snapshot}
              />
            ))}
          </div>
        </div>
      )}

      {/* KPI Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>KPI Trends (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {trendsLoading ? (
            <Loading message="Loading trends..." />
          ) : kpiTrends?.data && kpiTrends.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={kpiTrends.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="metric_date"
                  tickFormatter={(date) => format(parseISO(date), 'MM/dd')}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(date) => format(parseISO(date), 'MMM dd, yyyy')}
                />
                <Line
                  type="monotone"
                  dataKey="avg_variance"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Avg Variance %"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-12">
              No trend data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action Required Section */}
      {stats.stores_requiring_action > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <CardTitle>Action Required</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <strong>{stats.stores_requiring_action}</strong> store
              {stats.stores_requiring_action !== 1 ? 's' : ''} require immediate attention.
              Review critical stores above and take necessary actions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
