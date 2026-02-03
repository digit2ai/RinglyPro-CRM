import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { StatusBadge } from './StatusBadge';
import { Badge } from './ui/Badge';
import { AlertTriangle, TrendingDown, TrendingUp, Phone } from 'lucide-react';
import { getEscalationLevelLabel } from '@/lib/utils';

export function StoreHealthCard({ store, snapshot }) {
  if (!snapshot) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">No health data available</p>
        </CardContent>
      </Card>
    );
  }

  const hasIssues = snapshot.action_required || snapshot.escalation_level >= 2;

  return (
    <Link to={`/stores/${store.id}`}>
      <Card className={`hover:shadow-lg transition-shadow cursor-pointer ${
        hasIssues ? 'border-l-4 border-l-danger' : ''
      }`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg font-semibold">
                {store.store_code} - {store.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {store.city}, {store.state}
              </p>
            </div>
            <StatusBadge status={snapshot.overall_status}>
              {snapshot.overall_status.toUpperCase()}
            </StatusBadge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            {/* Health Score */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Health Score</span>
                <span className="text-2xl font-bold">{Number(snapshot.health_score).toFixed(1)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    Number(snapshot.health_score) >= 80 ? 'bg-success' :
                    Number(snapshot.health_score) >= 60 ? 'bg-warning' : 'bg-danger'
                  }`}
                  style={{ width: `${Number(snapshot.health_score)}%` }}
                />
              </div>
            </div>

            {/* KPI Status Breakdown */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-success" />
                  <span>{snapshot.green_kpi_count}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-warning" />
                  <span>{snapshot.yellow_kpi_count}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-danger" />
                  <span>{snapshot.red_kpi_count}</span>
                </div>
              </div>

              {snapshot.escalation_level > 0 && (
                <Badge variant={snapshot.escalation_level >= 3 ? 'danger' : 'warning'}>
                  Level {snapshot.escalation_level}
                </Badge>
              )}
            </div>

            {/* Action Required */}
            {snapshot.action_required && (
              <div className="flex items-start gap-2 p-3 bg-danger/10 rounded-md">
                <AlertTriangle className="w-4 h-4 text-danger mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-danger">Action Required</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {snapshot.summary || 'Immediate attention needed'}
                  </p>
                </div>
              </div>
            )}

            {/* Escalation Level 3+ (AI Call) */}
            {snapshot.escalation_level >= 3 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Phone className="w-4 h-4" />
                <span>AI call initiated</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
