import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { alertApi } from '@/lib/api';
import { useAlertUpdates } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Loading } from '@/components/Loading';
import { ErrorMessage } from '@/components/ErrorMessage';
import { AlertTriangle, Check, X, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';

export function AlertsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('active');
  const [severityFilter, setSeverityFilter] = useState('all');

  // Fetch alerts with filters
  const {
    data: alerts,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['alerts', statusFilter, severityFilter],
    queryFn: () =>
      alertApi.getAll({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        severity: severityFilter !== 'all' ? severityFilter : undefined,
        limit: 50,
      }),
  });

  // Acknowledge alert mutation
  const acknowledgeMutation = useMutation({
    mutationFn: ({ id, acknowledged_by }) =>
      alertApi.acknowledge(id, acknowledged_by),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Resolve alert mutation
  const resolveMutation = useMutation({
    mutationFn: (id) => alertApi.resolve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // Real-time updates
  const handleRealtimeUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
  }, [queryClient]);

  useAlertUpdates(handleRealtimeUpdate);

  const handleAcknowledge = (alertId) => {
    acknowledgeMutation.mutate({
      id: alertId,
      acknowledged_by: 'Dashboard User', // In real app, use actual user
    });
  };

  const handleResolve = (alertId) => {
    resolveMutation.mutate(alertId);
  };

  if (isLoading) {
    return <Loading message="Loading alerts..." />;
  }

  if (error) {
    return <ErrorMessage error={error} retry={refetch} />;
  }

  const alertData = alerts?.data || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Alert Management</h1>
        <p className="text-muted-foreground mt-1">
          Monitor and manage store alerts
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <div className="flex gap-2">
                {['all', 'active', 'acknowledged', 'resolved'].map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={statusFilter === status ? 'default' : 'outline'}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Severity:</span>
              <div className="flex gap-2">
                {['all', 'yellow', 'red', 'critical'].map((severity) => (
                  <Button
                    key={severity}
                    size="sm"
                    variant={severityFilter === severity ? 'default' : 'outline'}
                    onClick={() => setSeverityFilter(severity)}
                  >
                    {severity.charAt(0).toUpperCase() + severity.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alerts List */}
      <div className="space-y-4">
        {alertData.length > 0 ? (
          alertData.map((alert) => (
            <Card
              key={alert.id}
              className={alert.severity === 'red' || alert.severity === 'critical' ? 'border-l-4 border-l-danger' : ''}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* Alert Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <StatusBadge status={alert.severity} />
                      <StatusBadge status={alert.status}>
                        {alert.status}
                      </StatusBadge>
                      {alert.escalation_level > 0 && (
                        <Badge variant="warning">
                          Level {alert.escalation_level}
                        </Badge>
                      )}
                    </div>

                    {/* Alert Title */}
                    <h3 className="text-lg font-semibold mb-2">
                      {alert.title}
                    </h3>

                    {/* Alert Message */}
                    <p className="text-sm text-muted-foreground mb-4">
                      {alert.message}
                    </p>

                    {/* Store Info */}
                    {alert.store && (
                      <Link
                        to={`/stores/${alert.store.id}`}
                        className="inline-flex items-center text-sm text-primary hover:underline mb-4"
                      >
                        {alert.store.store_code} - {alert.store.name}
                      </Link>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span>
                        Created: {format(parseISO(alert.alert_date), 'MMM dd, yyyy HH:mm')}
                      </span>
                      {alert.acknowledged_at && (
                        <span>
                          Acknowledged: {format(parseISO(alert.acknowledged_at), 'MMM dd, HH:mm')}
                          {alert.acknowledged_by && ` by ${alert.acknowledged_by}`}
                        </span>
                      )}
                      {alert.expires_at && (
                        <span>
                          Expires: {format(parseISO(alert.expires_at), 'MMM dd, HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {alert.status === 'active' && (
                    <div className="flex flex-col gap-2">
                      {alert.requires_acknowledgment && (
                        <Button
                          size="sm"
                          onClick={() => handleAcknowledge(alert.id)}
                          disabled={acknowledgeMutation.isPending}
                        >
                          <Check className="w-4 h-4 mr-2" />
                          Acknowledge
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResolve(alert.id)}
                        disabled={resolveMutation.isPending}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Resolve
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No alerts found matching the selected filters
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
