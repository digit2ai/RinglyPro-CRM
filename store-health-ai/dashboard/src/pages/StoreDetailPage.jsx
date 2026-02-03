import React, { useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { storeApi } from '@/lib/api';
import { useAlertUpdates, useKpiUpdates } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/Loading';
import { ErrorMessage } from '@/components/ErrorMessage';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Phone,
  AlertTriangle,
  CheckSquare,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { formatPercent, getEscalationLevelLabel } from '@/lib/utils';

export function StoreDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();

  // Fetch store details
  const { data: store, isLoading: storeLoading, error: storeError } = useQuery({
    queryKey: ['stores', id],
    queryFn: () => storeApi.getById(id),
  });

  // Fetch current health
  const { data: health } = useQuery({
    queryKey: ['stores', id, 'health'],
    queryFn: () => storeApi.getHealth(id),
  });

  // Fetch health history
  const { data: healthHistory } = useQuery({
    queryKey: ['stores', id, 'health-history'],
    queryFn: () => storeApi.getHealthHistory(id, 30),
  });

  // Fetch current KPIs
  const { data: kpis } = useQuery({
    queryKey: ['stores', id, 'kpis'],
    queryFn: () => storeApi.getKpis(id),
  });

  // Fetch alerts
  const { data: alerts } = useQuery({
    queryKey: ['stores', id, 'alerts'],
    queryFn: () => storeApi.getAlerts(id, { status: 'active', limit: 10 }),
  });

  // Fetch tasks
  const { data: tasks } = useQuery({
    queryKey: ['stores', id, 'tasks'],
    queryFn: () => storeApi.getTasks(id, { status: 'pending', limit: 10 }),
  });

  // Fetch AI calls
  const { data: calls } = useQuery({
    queryKey: ['stores', id, 'calls'],
    queryFn: () => storeApi.getAiCalls(id),
  });

  // Real-time updates
  const handleRealtimeUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['stores', id] });
  }, [queryClient, id]);

  useAlertUpdates(handleRealtimeUpdate);
  useKpiUpdates(handleRealtimeUpdate);

  if (storeLoading) {
    return <Loading message="Loading store details..." />;
  }

  if (storeError) {
    return <ErrorMessage error={storeError} />;
  }

  const storeData = store?.data;
  const snapshot = health?.data?.snapshot;
  const metrics = health?.data?.metrics || [];

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      {/* Store Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {storeData?.store_code} - {storeData?.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {storeData?.address}, {storeData?.city}, {storeData?.state} {storeData?.zip_code}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Manager: {storeData?.manager_name} ({storeData?.manager_phone})
          </p>
        </div>
        {snapshot && (
          <StatusBadge status={snapshot.overall_status}>
            {snapshot.overall_status.toUpperCase()}
          </StatusBadge>
        )}
      </div>

      {/* Health Score Card */}
      {snapshot && (
        <Card>
          <CardHeader>
            <CardTitle>Health Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <div className="text-4xl font-bold mb-2">
                  {snapshot.health_score.toFixed(1)}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      snapshot.health_score >= 80 ? 'bg-success' :
                      snapshot.health_score >= 60 ? 'bg-warning' : 'bg-danger'
                    }`}
                    style={{ width: `${snapshot.health_score}%` }}
                  />
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">KPI Status</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-success" />
                    <span className="font-semibold">{snapshot.green_kpi_count}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-warning" />
                    <span className="font-semibold">{snapshot.yellow_kpi_count}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-danger" />
                    <span className="font-semibold">{snapshot.red_kpi_count}</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Escalation Level</p>
                <Badge variant={snapshot.escalation_level >= 3 ? 'danger' : 'warning'}>
                  {getEscalationLevelLabel(snapshot.escalation_level)}
                </Badge>
              </div>
            </div>

            {snapshot.action_required && (
              <div className="mt-4 p-4 bg-danger/10 rounded-md">
                <p className="text-sm font-medium text-danger">
                  {snapshot.summary}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Current KPIs</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {metrics.map((metric) => (
                <div
                  key={metric.kpi_code}
                  className="p-4 border rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold">{metric.kpi_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {metric.category}
                      </p>
                    </div>
                    <StatusBadge status={metric.status} />
                  </div>
                  <div className="flex items-center gap-2 text-2xl font-bold">
                    {metric.value}
                    {metric.variance_pct !== 0 && (
                      <span
                        className={`flex items-center text-sm ${
                          metric.variance_pct >= 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {metric.variance_pct >= 0 ? (
                          <TrendingUp className="w-4 h-4 mr-1" />
                        ) : (
                          <TrendingDown className="w-4 h-4 mr-1" />
                        )}
                        {formatPercent(metric.variance_pct)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No KPI data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Health History Chart */}
      {healthHistory?.data && healthHistory.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Health Score History (30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={healthHistory.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="snapshot_date"
                  tickFormatter={(date) => format(parseISO(date), 'MM/dd')}
                />
                <YAxis domain={[0, 100]} />
                <Tooltip
                  labelFormatter={(date) => format(parseISO(date), 'MMM dd, yyyy')}
                />
                <Line
                  type="monotone"
                  dataKey="health_score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  name="Health Score"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Alerts and Tasks */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Active Alerts */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Active Alerts</CardTitle>
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            {alerts?.data && alerts.data.length > 0 ? (
              <div className="space-y-3">
                {alerts.data.map((alert) => (
                  <div key={alert.id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between mb-1">
                      <StatusBadge status={alert.severity} />
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(alert.alert_date), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-2">{alert.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No active alerts
              </p>
            )}
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pending Tasks</CardTitle>
              <CheckSquare className="w-5 h-5 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {tasks?.data && tasks.data.length > 0 ? (
              <div className="space-y-3">
                {tasks.data.map((task) => (
                  <div key={task.id} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between mb-1">
                      <Badge variant="warning">Priority {task.priority}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Due: {format(parseISO(task.due_date), 'MMM dd')}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-2">{task.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No pending tasks
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Call History */}
      {calls?.data && calls.data.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              <CardTitle>AI Call History</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {calls.data.map((call) => (
                <div key={call.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={
                      call.outcome === 'acknowledged' ? 'success' :
                      call.outcome === 'callback_requested' ? 'warning' : 'default'
                    }>
                      {call.outcome || call.call_status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {format(parseISO(call.scheduled_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                  {call.call_duration && (
                    <p className="text-sm text-muted-foreground">
                      Duration: {call.call_duration}s
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
