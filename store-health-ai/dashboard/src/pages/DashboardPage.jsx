import React, { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi, storeApi } from '@/lib/api';
import { useAlertUpdates, useKpiUpdates } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StoreHealthCard } from '@/components/StoreHealthCard';
import { CriticalIndicators } from '@/components/CriticalIndicators';
import { ExecutiveSummary } from '@/components/ExecutiveSummary';
import { TrafficLight } from '@/components/TrafficLight';
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">Dashboard</h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mt-1">
            <p className="text-xs sm:text-base text-muted-foreground">
              Store health monitoring
            </p>
            <TrafficLight
              redStores={stats.red_stores || 0}
              yellowStores={stats.yellow_stores || 0}
              greenStores={stats.green_stores || 0}
              totalStores={stats.total_stores || 0}
            />
          </div>
        </div>
      </div>

      {/* Critical Flight Indicators */}
      <CriticalIndicators dashboardData={stats} />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Stores</CardTitle>
            <Store className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">{stats.total_stores || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              Active locations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Green</CardTitle>
            <div className="h-2 w-2 sm:h-3 sm:w-3 rounded-full bg-success" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-success">
              {stats.green_stores || 0}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              Healthy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Yellow/Red</CardTitle>
            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 text-warning" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-danger">
              {(stats.yellow_stores || 0) + (stats.red_stores || 0)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              {stats.yellow_stores || 0}Y / {stats.red_stores || 0}R
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Health Score</CardTitle>
            <Activity className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold">
              {stats.average_health_score?.toFixed(1) || '0.0'}%
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2 mt-1 sm:mt-2">
              <div
                className="h-1.5 sm:h-2 rounded-full bg-primary transition-all"
                style={{ width: `${stats.average_health_score || 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Critical Stores */}
      {criticalStores?.data && criticalStores.data.length > 0 && (
        <div>
          <h2 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-4">Critical Stores</h2>
          <div className="grid gap-2 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="text-sm sm:text-base">KPI Trends (7 Days)</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
          {trendsLoading ? (
            <Loading message="Loading trends..." />
          ) : kpiTrends?.data && kpiTrends.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={200} className="sm:!h-[300px]">
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

      {/* Executive Summary for Virginia AI */}
      <ExecutiveSummary dashboardData={stats} criticalStores={criticalStores?.data} />
    </div>
  );
}
